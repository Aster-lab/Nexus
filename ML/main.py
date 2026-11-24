import os
from contextlib import asynccontextmanager
from datetime import datetime
import logging
import math
import hmac
from typing import Any, Dict, List, Optional,Union,Literal
from fastapi import Body,Depends,FastAPI,Header,HTTPException,status
from pydantic import BaseModel, ConfigDict, Field,field_validator,model_validator
from feature_contract import FEATURE_SCHEMA_VERSION, PREDICTION_OUTPUT_SCHEMA_VERSION, PREDICTION_RESPONSE_SCHEMA_VERSION
from predict import FEATURE_NAMES,RiskEngine
from recommendation.recommendation_service import get_recommendations
from recommendation.contracts import InvestorPreferenceContract
from recommendation.data.json_repository import load_json
from recommendation.data.path import RECOMMENDATION_CONFIG_PATH
from recommendation.recommend import score_dynamic_candidates

logger = logging.getLogger(__name__)
engine: Optional[RiskEngine] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    model_dir =os.path.join(os.path.dirname(__file__),'models')
    try:
        engine = RiskEngine(model_dir=model_dir,anchor_threshold=0.48)
        print('All ^ models are loaded into memory successfully')
        yield
    except Exception as e:
        print(f"[NEXUS ERROR] Engine initialization failed: {e}")
        raise e
    finally:
        engine = None

app = FastAPI(
    title = "Nexus Credit Risk scoring engine",
    version = '1.0.0',
    description = 'Product REST API for hybrid SOM-GBDT laon risk tiering algorithm',
    lifespan = lifespan,
)
class LoanApplicationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid",allow_inf_nan = False, strict = True,)

    annual_income: float = Field(...,gt=0,json_schema_extra={"example": 75000.0, "description": "Annual income in the training dataset's native amount units"})
    dti: float = Field(...,ge=0,json_schema_extra={"example": 16.5, "description": "Debt-to-income percentage points, matching preprocessing"})
    loan_amount: float = Field(...,gt=0,json_schema_extra={"example": 12000, "description": "Loan amount in the training dataset's native amount units"})
    acc_open_past_24mths: float = Field(...,ge=0,json_schema_extra={"example": 2.0, "description": "Bank account openings in past 24 months"})
    bc_util : float = Field(...,ge=0,le=1,json_schema_extra={"example": 0.195, "description": "Bank card utilization proportion from 0 to 1"})
    lti : float = Field (...,ge=0,json_schema_extra={"example": 0.16, "description": "Loan-to-income ratio"})
    interest_burden: float = Field(...,ge=0,json_schema_extra={"example": 0.0184, "description": "Dimensionless ratio: loan amount times interest rate divided by annual income plus 1"})
    sub_grade_num : float = Field(...,ge=1,le=35,json_schema_extra={"example": 12, "description": "Numeric subgrade identifier"})
    int_rate: float = Field(...,ge=0,le=1.0,json_schema_extra={"example": 0.115, "description": "Interest rate expressed as a decimal"})
    revol_util: float = Field(...,ge=0,le=1,json_schema_extra={"example": 0.382, "description": "Revolving utilization proportion from 0 to 1"})
    term_months: float = Field(...,gt=0,json_schema_extra={"example": 36.0, "description": "Repayment term length in months (36.0 or 60.0)"})

    @field_validator("annual_income", "dti", "loan_amount", "acc_open_past_24mths",
                     "bc_util", "lti", "interest_burden", "sub_grade_num", "int_rate",
                     "revol_util", "term_months", mode="before")

    @classmethod
    def require_json_number(cls,value:Any)->Any:
        if isinstance(value,bool) or not isinstance(value,(int,float)):
            raise ValueError("Input must be a json number")
        if isinstance(value,float) and not math.isfinite(value):
            raise ValueError("Input must be a finite number")
        return value

    @field_validator("sub_grade_num","term_months")
    @classmethod
    def require_whole_number(cls,value:float)-> float:
        if not value.is_integer():
            raise ValueError("Input must be a whole number")
        return value

    def to_feature_list(self) -> List[float]:
        return [getattr(self,feature) for feature in FEATURE_NAMES]


class PredictionRequestSchema(BaseModel):
    """Versioned request envelope; raw feature objects remain v1-compatible."""
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["nexus_risk_features.v1"]
    features: LoanApplicationSchema


class PredictionTierSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    tier_code: str
    tier_name: str
    risk_level: str
    action_code: str
    rate_markup: float = Field(allow_inf_nan=False)
    ui_badge_color: str


class PredictionSpatialMetricsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    macro_cluster: int
    quantization_distance: float = Field(ge=0, allow_inf_nan=False)


class PredictionOutputSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    default_probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    tier: PredictionTierSchema
    spatial_metrics: PredictionSpatialMetricsSchema


class PersistedPredictionOutputSchema(PredictionOutputSchema):
    """Versioned shape for the JSON document stored in PredictionRecord."""
    schema_version: Literal[PREDICTION_OUTPUT_SCHEMA_VERSION]


class PredictionItemSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    index: int = Field(ge=0)
    prediction: PredictionOutputSchema


class PredictionErrorDetailSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    field: str | None
    message: str


class PredictionItemErrorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    index: int = Field(ge=0)
    error_code: str
    details: list[PredictionErrorDetailSchema]


class PredictionBatchResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["nexus_prediction_batch.v1"]
    status: Literal["success", "partial_success"]
    processed_count: int = Field(ge=0)
    data: list[PredictionItemSchema]
    errors: list[PredictionItemErrorSchema]

    @model_validator(mode="after")
    def validate_batch_consistency(self):
        if self.processed_count != len(self.data):
            raise ValueError("processed_count must equal the number of prediction data items")
        successful_indices = [item.index for item in self.data]
        error_indices = [item.index for item in self.errors]
        if len(successful_indices) != len(set(successful_indices)):
            raise ValueError("prediction data indices must be unique")
        if len(error_indices) != len(set(error_indices)):
            raise ValueError("error indices must be unique")
        if set(successful_indices) & set(error_indices):
            raise ValueError("an input index cannot appear in both data and errors")
        if self.status == "success" and self.errors:
            raise ValueError("success response cannot contain validation errors")
        if self.status == "partial_success" and not self.errors:
            raise ValueError("partial_success response must contain validation errors")
        return self


class DynamicRecommendationCandidateSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    loan_id: str = Field(min_length=36, max_length=36)
    principal_satang: int = Field(gt=0)
    funded_satang: int = Field(ge=0)
    annual_interest_rate: float = Field(ge=0, le=1, allow_inf_nan=False)
    term_months: int = Field(gt=0)
    loan_purpose: Literal["business", "education", "medical", "personal", "home", "other"]
    risk_tier: Literal["TIER_A", "TIER_B", "TIER_C", "TIER_D"]

    @field_validator("loan_id")
    @classmethod
    def require_uuid(cls, value: str) -> str:
        from uuid import UUID
        try:
            UUID(value)
        except ValueError:
            raise ValueError("loan_id must be a UUID") from None
        return value

    @model_validator(mode="after")
    def validate_funding_amount(self):
        if self.funded_satang >= self.principal_satang:
            raise ValueError("candidate must have remaining funding capacity")
        return self


class DynamicRecommendationRequestSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_investor_recommendation_request.v1"]
    preferences: InvestorPreferenceContract
    candidates: List[DynamicRecommendationCandidateSchema] = Field(max_length=200)

    @model_validator(mode="after")
    def validate_unique_candidates(self):
        ids = [candidate.loan_id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("candidate loan IDs must be unique")
        return self


class RecommendationFeatureScoresSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    risk_tier: float = Field(ge=0, le=1, allow_inf_nan=False)
    interest_rate: float = Field(ge=0, le=1, allow_inf_nan=False)
    loan_duration: float = Field(ge=0, le=1, allow_inf_nan=False)
    loan_amount: float = Field(ge=0, le=1, allow_inf_nan=False)
    loan_purpose: float = Field(ge=0, le=1, allow_inf_nan=False)


class DynamicRecommendationItemSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    loan_id: str
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    feature_scores: RecommendationFeatureScoresSchema


class DynamicRecommendationResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["nexus_investor_recommendation_response.v1"]
    recommendations: List[DynamicRecommendationItemSchema]

    @model_validator(mode="after")
    def validate_unique_results(self):
        ids = [item.loan_id for item in self.recommendations]
        if len(ids) != len(set(ids)):
            raise ValueError("recommendation loan IDs must be unique")
        return self


def parse_prediction_item(item: Any) -> LoanApplicationSchema:
    if not isinstance(item, dict):
        raise ValueError("Each application must be a JSON object")
    if "schema_version" in item or "features" in item:
        request = PredictionRequestSchema.model_validate(item)
        return request.features
    return LoanApplicationSchema.model_validate(item)

@app.get('/health',status_code = status.HTTP_200_OK)
def health_check() -> Dict[str,str]:
    if engine is None:
        raise HTTPException(
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE,
            detail = 'Risk Engine is uninitialized or degraded.',
        )
    return {'status':'healthy','model_engine': 'online'}

def require_ml_service_token(x_ml_service_token: Optional[str] = Header(default=None)) -> None:
    configured_token = os.getenv("ML_SERVICE_TOKEN", "")
    if len(configured_token) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error_code": "PREDICTION_AUTH_NOT_CONFIGURED"},
        )
    if x_ml_service_token is None or not hmac.compare_digest(
        x_ml_service_token, configured_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "UNAUTHORIZED"},
        )


@app.post('/predict',status_code = status.HTTP_200_OK)
def predict_credit_risk(
    application : Any= Body(...),
    _: None = Depends(require_ml_service_token),
) -> Dict[str,Any]:
    if engine is None:
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail = {
                "error_code" : 'ENGINE_UNAVAILABLE',
                'message' : 'Prediction service is currently unavailable.',
            },
        )

    is_batch = isinstance(application, list)
    raw_items = application if is_batch else [application]
    if not raw_items:
        raise HTTPException(
            status_code = status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail = {
                "error_code" : "BATCH_VALIDATION_FAILED",
                "errors" : [],
                "message" : 'At least one application is required',
            },
        )

    valid_items : List[Dict[str,Any]] = []
    validation_errors: List[Dict[str,Any]] = []

    for index, item in enumerate(raw_items):
        try:
            validated = parse_prediction_item(item)
            valid_items.append(
                {
                    "index": index,
                    "features": validated.to_feature_list(),
                }
            )
        except Exception as exc:
            if hasattr(exc, "errors") and callable(exc.errors):
                details = [
                    {
                        "field": ".".join(str(part) for part in error.get("loc", ())) or None,
                        "message": error.get("msg", "Invalid value."),
                    }
                    for error in exc.errors()
                ]
            else:
                details = [{"field": None, "message": str(exc)}]

            validation_errors.append(
                {
                    "index": index,
                    "error_code": "VALIDATION_ERROR",
                    "details": details,
                }
            )

    if not valid_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "BATCH_VALIDATION_FAILED",
                "errors": validation_errors,
            },
        )

    try:
        predictions = engine.predict_risk(
            [item["features"] for item in valid_items]
        )
        if len(predictions) != len(valid_items):
            raise RuntimeError("Prediction count does not match valid input count.")
    except Exception:
        logger.exception("Risk model inference failed for /predict request")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "INFERENCE_FAILED",
                "message": "Prediction could not be completed.",
            },
        ) from None

    data = [
        {"index": item["index"], "prediction": prediction}
        for item, prediction in zip(valid_items, predictions)
    ]

    if validation_errors:
        response_status = "partial_success"
    else:
        response_status = "success"

    response = {
        "schema_version": PREDICTION_RESPONSE_SCHEMA_VERSION,
        "status": response_status,
        "processed_count": len(data),
        "data": data,
        "errors": validation_errors,
    }
    return PredictionBatchResponseSchema.model_validate(response).model_dump(mode="json")

@app.get('/recommendations', status_code=status.HTTP_200_OK)
def recommend_credit_loans(current_time: str) -> Dict[str, Any]:
    """Return ranked loan recommendations for a timezone-aware ISO 8601 time."""
    try:
        parsed_current_time = datetime.fromisoformat(
            current_time.replace("Z", "+00:00")
        )
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "INVALID_CURRENT_TIME",
                "message": (
                    "current_time must be an ISO 8601 datetime with a timezone, "
                    "for example 2026-10-19T20:30:00+07:00."
                ),
            },
        ) from None

    if parsed_current_time.tzinfo is None or parsed_current_time.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "TIMEZONE_REQUIRED",
                "message": "current_time must include a timezone offset.",
            },
        )

    try:
        return get_recommendations(current_time=parsed_current_time)
    except (FileNotFoundError, ValueError, KeyError) as exc:
        logger.exception("Recommendation request could not be processed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "RECOMMENDATION_FAILED",
                "message": "Recommendations could not be generated from the current data.",
            },
        ) from exc


@app.post('/recommendations', status_code=status.HTTP_200_OK)
def recommend_nexus_candidates(
    request: DynamicRecommendationRequestSchema,
    _: None = Depends(require_ml_service_token),
) -> Dict[str, Any]:
    """Rank the authenticated backend's eligible, investor-specific candidates."""
    try:
        config = load_json(RECOMMENDATION_CONFIG_PATH)
        result = score_dynamic_candidates(
            preferences=request.preferences.model_dump(),
            candidates=[candidate.model_dump() for candidate in request.candidates],
            config=config,
        )
        return DynamicRecommendationResponseSchema.model_validate(result).model_dump(mode="json")
    except (FileNotFoundError, ValueError, KeyError):
        logger.exception("Dynamic recommendation request could not be processed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error_code": "RECOMMENDATION_SERVICE_UNAVAILABLE"},
        ) from None
    except Exception as exc:
        logger.exception("Unexpected error while generating recommendations")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "RECOMMENDATION_FAILED",
                "message": "Recommendations could not be generated.",
            },
        ) from exc
if __name__=='__main__':
    import uvicorn
    uvicorn.run('main:app',host = '127.0.0.1',port = 8000,reload = True)
