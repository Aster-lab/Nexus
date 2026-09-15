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
features = [c for c in df.columns if c!= 'target']
n_cols = 3
n_rows = int(np.ceil(len(features)/n_cols))

fig, axes = plt.subplots(n_rows, n_cols, figsize=(15, 3.5 * n_rows))
axes = axes.flatten()

for idx, col in enumerate(features):
        sns.boxplot(
            data=df,
            x="target",
            y=col,
            hue="target",
            palette={0: "#2ecc71", 1: "#e74c3c"},
            ax=axes[idx],
            fliersize=1.5,
            legend=False,
        )
        axes[idx].set_title(col, fontsize=11, fontweight="bold")
        axes[idx].set_xticklabels(["Paid (0)", "Default (1)"])
        axes[idx].set_xlabel("")
        axes[idx].set_ylabel("")

    # Remove empty axes grid cells
for j in range(idx + 1, len(axes)):
    fig.delaxes(axes[j])
    
plt.tight_layout()
plt.savefig(output_dir/'boxplot.png',dpi=300)
plt.close()

print(f"Heatmap saved to: {output_dir}")