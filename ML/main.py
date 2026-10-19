import os
from contextlib import asynccontextmanager
from datetime import datetime
import logging
import math
from typing import Any, Dict, List, Optional,Union
from fastapi import Body,FastAPI,HTTPException,status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field,field_validator
from predict import FEATURE_NAMES,RiskEngine
from recommendation.recommendation_service import get_recommendations

logger = logging.getLogger(__name__)
#singleton reference
engine: Optional[RiskEngine] = None

#lifecycle - loads models into memory and pauses when api is active
@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    model_dir =os.path.join(os.path.dirname(__file__),'models')
    try:
        engine = RiskEngine(model_dir=model_dir,anchor_threshold=0.48)
        print('All ^ models are loaded into memory successfully')
    except Exception as e:
        print(f"[NEXUS ERROR] Engine initialization failed: {e}")
        raise e
    yield
    engine = None

#setup
app = FastAPI(
    title = "Nexus Credit Risk scoring engine",
    version = '1.0.0',
    description = 'Product REST API for hybrid SOM-GBDT laon risk tiering algorithm',
    lifespan = lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials= True,
    allow_methods=['*'],
    allow_headers=['*'],
)

#Validation
class LoanApplicationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid",allow_inf_nan = False, strict = True,)

    annual_income: float = Field(...,gt=0,example = 75000.0, description = 'Annual Income')
    dti: float = Field(...,ge=0,example= 16.5, description = 'Debt-to-income ratio percentage')
    loan_amount: float = Field(...,gt=0,example = 12000,description='Requested loan amount')
    acc_open_past_24mths: float = Field(...,ge=0,example = 2.0,description='Bank account openings in past 24 months')
    bc_util : float = Field(...,ge=0,example = 19.5,description='Bank card utilization percentage')
    lti : float = Field (...,ge=0,example = 0.16,description='Loan to income ration')
    interest_burden: float = Field(...,ge=0,example = 1800.0,description='Estimate annual interest obligation')
    sub_grade_num : float = Field(...,ge=1,le=35,example = 12,description='Numeric subgrade identifier')
    int_rate: float = Field(...,ge=0,le=1.0,example=0.115,description="Interest rate expressed as a decimal")
    revol_util: float = Field(...,ge=0,example=38.2,description="Total revolving balance utilization percentage")
    term_months: float = Field(...,ge=0,example=36.0,description="Repayment term length in months (36.0 or 60.0)",)

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

#health check
@app.get('/health',status_code = status.HTTP_200_OK)
def health_check() -> Dict[str,str]:
    if engine is None:
        raise HTTPException(
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE,
            detail = 'Risk Engine is uninitialized or degraded.',
        )
    return {'status':'healthy','model_engine': 'online'}

#algorithm
@app.post('/predict',status_code = status.HTTP_200_OK)
def predict_credit_risk(
    application : Any= Body(...)
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
            if not isinstance(item,dict):
                raise ValueError("Each application must be a JSON object")

            validated = LoanApplicationSchema.model_validate(item)
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "BATCH_VALIDATION_FAILED",
                "errors": validation_errors,
            },
        )

    # Predict all valid items in one call. If inference fails, fail the whole request.
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

    return {
        "status": response_status,
        "processed_count": len(data),
        "data": data,
        "errors": validation_errors,
    }

#Recommendation
@app.get('/recommendations', status_code=status.HTTP_200_OK)
def recommend_credit_loans(current_time: str) -> Dict[str, Any]:
    """Return ranked loan recommendations for a timezone-aware ISO 8601 time."""
    try:
        parsed_current_time = datetime.fromisoformat(
            current_time.replace("Z", "+00:00")
        )
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
