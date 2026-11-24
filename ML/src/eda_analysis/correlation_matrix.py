from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent.parent
data_path = BASE_DIR / "data"/'processed'/"cleaned_data.csv"
output_dir = BASE_DIR /"outputs"/'eda_plots'
output_dir.mkdir(exist_ok=True)

df = pd.read_csv(data_path)

corr = df.corr(method='pearson')
print("---Pearson Correlation Matrix---")
print(corr.round(3))

plt.figure(figsize=(10, 8))
corr = df.corr()
mask = np.triu(np.ones_like(corr,dtype=bool))

sns.heatmap(
    corr,
    mask = mask,
    annot =True,
    fmt=".2f",
    cmap = "coolwarm",
    vmax=1,
    vmin=-1,
    center=0,
    square=True,
    linewidths=0.5,
    cbar_kws={'shrink': 0.8},
)

plt.title("Feature Correlation Matrix",fontsize=12,fontweight='bold')
plt.tight_layout()
plt.savefig(output_dir/'correaltion_heatmap.png',dpi=300)
plt.close()

print(f"Heatmap saved to: {output_dir}")