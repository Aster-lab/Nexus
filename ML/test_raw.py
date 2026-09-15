from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import precision_score, recall_score, roc_auc_score, f1_score
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent
data_path = BASE_DIR / "data" / "processed" / "cleaned_data.csv"


def evaluate_baseline_metrics():
    if not data_path.exists():
        raise FileNotFoundError(
            f"Could not find '{data_path}'. Run clean_lendingclub.py first."
        )

    df = pd.read_csv(data_path)
    print("=== DATASET INTEGRITY CHECK ===")
    print(f"Total Rows: {len(df):,}")
    print(f"Total Missing Values: {df.isnull().sum().sum()}")
    print(
        f"Baseline Default Rate: {df['target'].mean():.2%} ("
        f"{df['target'].sum():,} cases)\n"
    )

    target = df['target']
    feature_cols = [c for c in df.columns if c != "target"]

    results = []
    for col in feature_cols:
        raw_auc = roc_auc_score(target, df[col])
        adj_auc = max(raw_auc, 1.0 - raw_auc)
        relationship = (
            "Direct (Risky)" if raw_auc >= 0.50 else "Inverse (Safer)"
        )

        results.append(
            {
                "Feature": col,
                "Raw AUC": round(raw_auc, 4),
                "Adjusted AUC": round(adj_auc, 4),
                "Relationship": relationship,
            }
        )

    summary_df = pd.DataFrame(results).sort_values(
        by="Adjusted AUC", ascending=False
    )
    print(summary_df.to_string(index=False))
    print("\n" + "=" * 50 + "\n")
    
    X = df.drop(columns=["target"])
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    # Fast baseline Gradient Boosting Classifier
    clf = HistGradientBoostingClassifier(class_weight = 'balanced',random_state=42)
    clf.fit(X_train, y_train)

    y_probs = clf.predict_proba(X_test)[:, 1]
    auc_score = roc_auc_score(y_test, y_probs)

    # Standard 0.50 threshold evaluation
    y_pred_default = (y_probs >= 0.50).astype(int)
    f1_default = f1_score(y_test, y_pred_default, zero_division=0)

    # Threshold Optimization Sweep to maximize F1 score
    thresholds = np.linspace(0.10, 0.90, 81)
    best_threshold = 0.50
    best_f1 = 0.0

    for thresh in thresholds:
        current_f1 = f1_score(
            y_test, (y_probs >= thresh).astype(int), zero_division=0
        )
        if current_f1 > best_f1:
            best_f1 = current_f1
            best_threshold = thresh

    y_pred_opt = (y_probs >= best_threshold).astype(int)
    prec_opt = precision_score(y_test, y_pred_opt, zero_division=0)
    rec_opt = recall_score(y_test, y_pred_opt, zero_division=0)

    print("=== BASELINE GBDT PERFORMANCE AUDIT ===")
    print(f"ROC-AUC Score:                  {auc_score:.4f}")
    print(f"Default (0.50 Threshold) F1:    {f1_default:.4f}")
    print(f"Optimal Threshold:              {best_threshold:.2f}")
    print(f"Optimized F1 Score:             {best_f1:.4f}")
    print(f"Precision @ Optimal Threshold:  {prec_opt:.4f}")
    print(f"Recall @ Optimal Threshold:     {rec_opt:.4f}")


if __name__ == "__main__":
    evaluate_baseline_metrics()