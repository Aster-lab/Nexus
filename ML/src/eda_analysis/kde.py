from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent.parent
data_path = BASE_DIR / "data"/'processed'/"cleaned_data.csv"
output_dir = BASE_DIR /"outputs"/'eda_plots'
output_dir.mkdir(exist_ok=True)

df = pd.read_csv(data_path)
features = [c for c in df.columns if c != 'target']
sns.set_theme(style="whitegrid")

n_cols = 3
n_rows = int(np.ceil(len(features) / n_cols))

fig, axes = plt.subplots(n_rows, n_cols, figsize=(15, 4 * n_rows))
axes = axes.flatten()

for idx, col in enumerate(features):
    sns.kdeplot(
        data=df,
        x=col,
        hue="target",
        common_norm=False,
        palette=["#2b5c8f", "#d95f02"], 
        alpha=0.4,
        fill=True,
        linewidth=1.5,
        ax=axes[idx],
    )
    axes[idx].set_title(f"Distribution: {col}", fontsize=11, fontweight="bold")  
    axes[idx].set_xlabel("Standardized Value (Z-Score)")
    axes[idx].set_ylabel("Density")

for j in range(idx + 1, len(axes)):
        fig.delaxes(axes[j])

plt.suptitle(
    "Continous Feature Distribution by Target Class",
    fontsize=14,
    fontweight='bold'
)
plt.tight_layout()
plt.savefig(output_dir/'feature_distribution.png',dpi=300)
plt.close()

print("Saved Successfully!")