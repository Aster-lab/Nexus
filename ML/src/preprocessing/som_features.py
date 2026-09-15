from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_PATH = BASE_DIR/ 'data'/ 'processed' /'cleaned_data.csv'
X_SOM_PATH = BASE_DIR / 'data' /'processed'/'som_features_scaled.npy'
SCALER_PATH = BASE_DIR /'models'/'som_scaler.pkl'

df=pd.read_csv(DATA_PATH)
X_features = df.drop(columns = ['target'])

scaler = MinMaxScaler()
X_som = scaler.fit_transform(X_features)

np.save(X_SOM_PATH,X_som)
joblib.dump(scaler,SCALER_PATH)

print(f"Dataset saved. X_som matrix created with shape: {X_som.shape}")

print(
    f"Matrix Range Check: Min = {X_som.min():.1f}, Max = {X_som.max():.1f}"
)
assert not np.isnan(X_som).any(), "NaN values found!"