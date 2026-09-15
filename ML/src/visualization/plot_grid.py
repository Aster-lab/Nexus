import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from sklearn.decomposition import PCA

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = BASE_DIR/ 'config'/'grid_config.json'
DATA_PATH = BASE_DIR/'data'/'processed'/'som_features_scaled.npy'
OUTPUT_PATH = BASE_DIR/'outputs'/'visual'/'initial_grid_mesh.png'

with open(CONFIG_PATH,'r') as file:
    config = json.load(file)

M,N = config['rows'],config['cols']
X_som = np.load(DATA_PATH,mmap_mode = 'r')

pca = PCA(n_components=2,random_state=42)
X_pca = pca.fit_transform(X_som)

lambda_1 , lambda_2 =config["lambda_1"],config["lambda_2"]
eigenvectors = pca.components_

w_x = np.linspace(-2 * np.sqrt(lambda_1), 2 * np.sqrt(lambda_1), N)
w_y = np.linspace(-2 * np.sqrt(lambda_2), 2 * np.sqrt(lambda_2), M)
grid_w_x, grid_w_y = np.meshgrid(w_x, w_y)
fig,axes = plt.subplots(1,2,figsize=(15,6.5))

x_coords, y_coords = [],[]
for r in range(M):
    for c in range(N):
        x = c+0.5*(r%2)
        y = r*(np.sqrt(3)/2)
        x_coords.append(x)
        y_coords.append(y)

axes[0].scatter(
    x_coords, y_coords, c="dodgerblue", edgecolors="navy", s=18, alpha=0.85
)
axes[0].set_title(
    f"Physical Hexagonal Grid ({M} Rows x {N} Cols = {M*N} Nodes)",
    fontsize=11,
    fontweight="bold",
)
axes[0].set_xlabel("Grid Columns (N)")
axes[0].set_ylabel("Grid Rows (M)")
axes[0].set_aspect("equal")
axes[0].grid(True, linestyle="--", alpha=0.3)

#PCA gird overlay
sample_idx = np.random.choice(len(X_pca), 4000, replace=False)
axes[1].scatter(
    X_pca[sample_idx, 0],
    X_pca[sample_idx, 1],
    c="lightgray",
    s=6,
    alpha=0.5,
    label="Borrowers (4k Subsample)",
)

for r in range(M):
    axes[1].plot(
        grid_w_x[r, :],
        grid_w_y[r, :],
        c="crimson",
        alpha=0.4,
        linewidth=0.8,
        zorder=3,
    )
for c in range(N):
    axes[1].plot(
        grid_w_x[:, c],
        grid_w_y[:, c],
        c="crimson",
        alpha=0.4,
        linewidth=0.8,
        zorder=3,
    )

axes[1].scatter(
    grid_w_x.flatten(),
    grid_w_y.flatten(),
    c="red",
    s=12,
    zorder=4,
    label="PCA Node Weights",
)
axes[1].set_title(
    "PCA Initialized Grid Mesh Over Data Plane", fontsize=11, fontweight="bold"
)
axes[1].set_xlabel("Principal Component 1")
axes[1].set_ylabel("Principal Component 2")
axes[1].legend(loc="upper right")
axes[1].grid(True, linestyle="--", alpha=0.3)

plt.tight_layout()

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(OUTPUT_PATH, dpi=300)
plt.show()

print(f"Grid visualization saved to: {OUTPUT_PATH}")