import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional,Union
from fastapi import FastAPI,HTTPException,status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from predict import FEATURE_NAMES,RiskEngine

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
    term_months: float = Field(...,example=36.0,description="Repayment term length in months (36.0 or 60.0)",)

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
    application : Union[List[LoanApplicationSchema],LoanApplicationSchema],
) -> Dict[str,Any]:
    if engine is None:
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail = "Nexus Engine is unavailable.",
        )

    if not isinstance(application, list):
        app_list = [application]
    else:
        app_list = application
    if not app_list:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail = 'Payload application cannot be empty',
        )

    try:
        raw_input = [app.to_feature_list() for app in application]
        predictions = engine.predict_risk(raw_input)

        return {
            'status': 'success',
            'processed_count' : len(predictions),
            'data' : predictions,
        }

    except Exception as e:
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail = f"Execution failure: {str(e)}"
        )
if __name__=='__main__':
    import uvicorn
    uvicorn.run('main:app',host = '127.0.0.1',port = 8000,reload = True)
