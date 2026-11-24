import os
import joblib
from pathlib import Path
import matplotlib
import matplotlib.pyplot as plt
matplotlib.use('Agg')
import numpy as np

BASE_DIR : Path = Path(__file__).resolve().parent.parent.parent
som_path : Path = BASE_DIR/'models'/'trained_credit_som.pkl'
map_path: Path = BASE_DIR /'models'/'node_risk_map.pkl'
kmeans_path : Path = BASE_DIR /'models'/ 'som_kmeans_clusters.pkl'
output_path : Path = BASE_DIR/'outputs'/'visual'/'model_diagnosis.png'

def generate_visual()->None:
    som = joblib.load(som_path)
    kmeans = joblib.load(kmeans_path)
    node_risk = joblib.load(map_path)

    weights = som.get_weights()
    grid_x,grid_y,num_features = weights.shape

    u_matrix = som.distance_map()

    risk_grid = np.zeros((grid_x,grid_y),dtype = np.float64)
    if risk_grid.ndim ==1 :
        risk_grid =risk_grid.reshape(grid_x,grid_y)

    weights_flat = weights.reshape(-1,num_features)
    cluster_labels = kmeans.predict(weights_flat)
    cluster_grid = cluster_labels.reshape(grid_x,grid_y)

    fig, axes = plt.subplots(1, 3, figsize=(22, 6.5), dpi=300)

    im0 = axes[0].imshow(
        u_matrix.T,cmap='magma',origin='lower',aspect='auto'
    )
    axes[0].set_title(
        'U-Matrix (Topological Boundaries)',
        fontsize=13,
        fontweight='bold',
        pad = 10,
    )

    axes[0].set_xlabel("Grid Coordinate X")
    axes[0].set_ylabel("Grid Corrdinated Y")

    cbar0= fig.colorbar(im0, ax=axes[0],fraction = 0.046,pad =0.04)
    cbar0.set_label('Neighbour distace',rotation=270,labelpad=15)

    im1 = axes[1].imshow(
        risk_grid.T,cmap = 'YlOrRd',origin = 'lower',aspect='auto'
    )
    axes[1].set_title(
        'Micro Node Risk heatmap',fontsize=13 ,fontweight='bold',pad=10,
    )
    axes[1].set_xlabel('Grid Coordinate X')
    axes[1].set_ylabel('Grid Coordinate Y')
    cbar1=fig.colorbar(im1,ax=axes[1],fraction = 0.046,pad =0.04)
    cbar1.set_label('Empirical Default Rate',rotation = 720,labelpad=15 )

    n_clusters  = kmeans.n_clusters
    cmap_discrete = plt.colormaps.get_cmap('tab10').resampled(n_clusters)
    im2 = axes[2].imshow(
        cluster_grid.T,
        cmap = cmap_discrete,
        origin = 'lower',
        aspect ='auto',
        vmin=0.5,
        vmax=n_clusters-0.5,
    )

    axes[2].set_title(
        'Marco Risk Tiers',
        fontsize=13,
        fontweight = 'bold',
        pad = 10,
    )
    axes[2].set_xlabel('Grid Coordinate X')
    axes[2].set_ylabel('Grid Coordinate Y')
    cbar2= fig.colorbar(
        im2,ax=axes[2], ticks = range(n_clusters), fraction = 0.046,pad = 0.04
    )
    cbar2.set_label('Cluster ID',rotation = 720,labelpad = 15)

    plt.tight_layout()
    plt.savefig(output_path,bbox_inches = 'tight')
    plt.close(fig)
    print('Successfully saved.')

if __name__=="__main__":
    generate_visual()



