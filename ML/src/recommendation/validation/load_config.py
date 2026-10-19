import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
CONFIG_PATH = BASE_DIR/'config'/'recommendation_config.json'

def load_config():
    with open(CONFIG_PATH,'r') as file:
        config = json.load(file)

    return config