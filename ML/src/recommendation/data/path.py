
from pathlib import Path
# Project root: the directory containing src/, data/, and config/
PROJECT_ROOT = Path(__file__).resolve().parents[3]

INVESTOR_DATA_PATH = (
    PROJECT_ROOT / "data" / "recommendation" / "investor.json"
)

LOAN_DATA_PATH = (
    PROJECT_ROOT / "data" / "recommendation" / "loan.json"
)

INVESTMENT_DATA_PATH = (
    PROJECT_ROOT / "data" / "recommendation" / "investment.json"
)

RECOMMENDATION_CONFIG_PATH = (
    PROJECT_ROOT / "config" / "recommendation_config.json"
)
