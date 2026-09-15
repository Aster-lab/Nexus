import os
import joblib
from predict import FEATURE_NAMES

scaler_path = os.path.join("models", "som_scaler.pkl")
scaler = joblib.load(scaler_path)

print(f"{'FEATURE NAME':<22} | {'MIN BOUND (data_min_)':<20} | {'MAX BOUND (data_max_)':<20}")
print("-" * 68)
for name, d_min, d_max in zip(FEATURE_NAMES, scaler.data_min_, scaler.data_max_):
    print(f"{name:<22} | {d_min:<20.4f} | {d_max:<20.4f}")