from dataclasses import asdict, dataclass
import json
import logging
from pathlib import Path
import numpy as np
from sklearn.decomposition import PCA

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s -%(levelname)s -%(message)s"
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_PATH = BASE_DIR / 'data' /'processed'/'som_features_scaled.npy'
DEFAULT_CONFIG_PATH = BASE_DIR /'config'/'grid_config.json'
VESANTO_COEFF = 5.0

@dataclass(frozen=True)
class SOMGridConfig:
    rows: int
    cols : int
    total_neurons : int
    aspect_ratio : float
    lambda_1 : float
    lambda_2 : float

def compute_grid_dimensions(
        X: np.ndarray, vesanto_coeff: float = VESANTO_COEFF
) -> SOMGridConfig :
    if X.ndim !=2:
        raise ValueError(f"Expected 2D array, got shape {X.shape}")
    if np.isnan(X).any() or np.isinf(X).any():
        raise ValueError(f"Input Matrix contains invalid values.")

    n_samples = X.shape[0]

    total_neurons = vesanto_coeff * np.sqrt(n_samples)

    X_std = (X - np.mean(X, axis=0)) / (np.std(X, axis=0) + 1e-8)
    pca = PCA(n_components = 2, svd_solver = 'randomized', random_state=42)
    pca.fit(X_std)
    lambda_1, lambda_2 = pca.explained_variance_

    if lambda_2 <=0:
        raise ValueError("Secondary eigenvalue is non-positive")
    aspect_ratio = np.sqrt(lambda_1/lambda_2)

    M = int(np.round(np.sqrt(total_neurons*aspect_ratio)))
    N = int(np.round(np.sqrt(total_neurons/aspect_ratio)))

    return SOMGridConfig(
        rows = M,
        cols = N,
        total_neurons = M * N,
        aspect_ratio = float(aspect_ratio),
        lambda_1= float(lambda_1),
        lambda_2 = float(lambda_2),
    )

def main():
    logger.info(f"Loading input matrix from {DEFAULT_INPUT_PATH}")

    X_som = np.load(DEFAULT_INPUT_PATH,mmap_mode='r')
    config = compute_grid_dimensions(X_som)

    logger.info(f"Target Capacity: {5*np.sqrt(X_som.shape[0]):.1f} neurons")
    logger.info(f"Eigenvalues: lambda1: {config.lambda_1:.4f}, lambda2= {config.lambda_2:.4f}")

    logger.info(f"Calculated Grid: {config.rows} X {config.cols} ({config.total_neurons} nodes)")

    with open(DEFAULT_CONFIG_PATH,'w') as file:
        json.dump(asdict(config),file,indent=4)

    logger.info(f"Configuration successfully exported to {DEFAULT_CONFIG_PATH}")

if __name__ == "__main__":
    main()