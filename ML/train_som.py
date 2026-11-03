from dataclasses import dataclass
import json
import logging
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from typing import Dict,List,Tuple
from sklearn.cluster import KMeans
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report,f1_score,roc_auc_score,precision_recall_curve
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import QuantileTransformer
from minisom import MiniSom

#configure
logging.basicConfig(
    level = logging.INFO,
    format = '%(asctime)s [%(levelname)s] %(name)s -%(message)s'
)
logger = logging.getLogger('SOM_Trainer')

@dataclass(frozen=True)
class SOMConfig:
    BASE_DIR : Path = Path(__file__).resolve().parent
    config_path: Path = BASE_DIR/'config'/'grid_config.json'
    data_path: Path = BASE_DIR/'data'/'processed'/'som_features_scaled.npy'
    save_path : Path = BASE_DIR/'models'/'trained_credit_som.pkl'
    minmax_scaler_path : Path = BASE_DIR/'models'/'som_scaler.pkl'
    scaler_path : Path = BASE_DIR/'models'/'som_quantile_scaler.pkl'
    imputer_path : Path = BASE_DIR/'models'/'som_imputer.pkl'
    map_path: Path = BASE_DIR /'models'/'node_risk_map.pkl'
    kmeans_path : Path = BASE_DIR /'models'/ 'som_kmeans_clusters.pkl'
    classifier_path : Path = BASE_DIR /'models'/'hybrid_credit_classifier.pkl'

    n_clusters: int = 8
    n_splits : int = 5
    seed: int = 42

    learning_rate: float = 0.7


class SOMPipeline:

    def __init__(self,labels:np.ndarray,config: SOMConfig= SOMConfig()):
        self.cfg = config
        self.grid_params = self._load_config()
        self.labels = labels
        self.data = np.load(self.cfg.data_path,mmap_mode='r')

    def _load_config(self)->Dict[str,int]:
        if not self.cfg.config_path.exists():
            raise FileNotFoundError(f'Config file missing at {self.cfg.config_path}')
        with open(self.cfg.config_path,'r') as file:
            return json.load(file)

    def create_som(self, X_train: np.ndarray) -> MiniSom:
        rows,cols = self.grid_params['rows'],self.grid_params['cols']
        initial_sigma = max(rows,cols) /1.5

        som = MiniSom(
            x=rows,
            y=cols,
            input_len = X_train.shape[1],
            sigma = initial_sigma,
            learning_rate = self.cfg.learning_rate,
            neighborhood_function='gaussian',
            topology = 'hexagonal',
            sigma_decay_function= 'linear_decay_to_one',
            decay_function= 'linear_decay_to_zero',
            random_seed= self.cfg.seed,
        )

        som.pca_weights_init(X_train)
        return som

    def train_som(self,som:MiniSom, X_train: np.ndarray) ->MiniSom:
        total_iterations = len(X_train) * 75
        #batch training
        som.train_random(
            X_train, 
            num_iteration=total_iterations, 
            verbose =False
        )
        return som

    def build_risk_map(
            self,
            som:MiniSom,
            X_scaled:np.ndarray,
            y:np.ndarray,
            m_weight : float = 10.0,
            ) -> np.ndarray:
        rows, cols = self.grid_params['rows'], self.grid_params['cols']
        global_default_rate = float(np.mean(y))

        node_defaults = np.zeros((rows,cols))
        node_counts = np.zeros((rows,cols))

        for sample,label in zip(X_scaled,y):
            bmu = som.winner(sample)
            node_defaults[bmu] += label
            node_counts[bmu] += 1

        smoothed_map = (node_defaults+m_weight*global_default_rate) / (
            node_counts + m_weight
            )

        return smoothed_map

    def extract_spatial_features(
        self,
        som:MiniSom, 
        kmeans: KMeans,
        risk_map : np.ndarray,
        X_scaled:np.ndarray,
        )-> np.ndarray:
        weights = som.get_weights()
        rows,cols, n_features = weights.shape

        #pre assign macro clusters
        weights_flat = weights.reshape(-1,n_features)
        node_clusters = kmeans.predict(weights_flat)

        spatial_rows = []

        for sample in X_scaled:
            bmu_x,bmu_y = som.winner(sample)
            bmu_vector = weights[bmu_x,bmu_y]

            #Quantization Distance
            q_dist = np.linalg.norm(sample - bmu_vector)

            #risk score
            r_score = risk_map[bmu_x,bmu_y]
            #cluster
            flat_node_idx = bmu_x * cols + bmu_y
            cluster_id = node_clusters[flat_node_idx]

            spatial_rows.append([ q_dist,cluster_id])

        return np.column_stack([X_scaled,np.array(spatial_rows)])
    
    
    def cross_validation(self) -> List[Dict[str,float]]:
        kf = StratifiedKFold(
            n_splits= self.cfg.n_splits,
            shuffle =True,
            random_state = self.cfg.seed,
        )
        metrics_history = []
        oof_probs = np.zeros(len(self.data))
        

        logger.info(f"Starting {self.cfg.n_splits}-Fold CV on {len(self.data)} samples...")

        for fold, (train_idx,val_idx) in enumerate(
            kf.split(self.data,self.labels),start=1
        ):
            X_train, X_val = self.data[train_idx],self.data[val_idx]
            Y_train , Y_val = self.labels[train_idx],self.labels[val_idx]
            
            #transformer
            scaler = QuantileTransformer(
                output_distribution="uniform",
                n_quantiles=min(1000, len(X_train)),
                random_state=self.cfg.seed,
            )
            X_train_scaled = scaler.fit_transform(X_train)
            X_val_scaled = scaler.transform(X_val)
            #initialize PCA & train
            som = self.create_som(X_train_scaled)
            som = self.train_som(som,X_train_scaled)

            #Evaluate
            qe = som.quantization_error(X_val_scaled)
            te = som.topographic_error(X_val_scaled)

            #macro-clustering
            codebook = som.get_weights().reshape(-1,X_train_scaled.shape[1])
            kmeans = KMeans(
                n_clusters = self.cfg.n_clusters,
                random_state=self.cfg.seed,
                n_init=10,
                ).fit(codebook)

            #risk map
            risk_map = self.build_risk_map(som,X_train_scaled,Y_train)

            #augmented features
            X_train_augmented = self.extract_spatial_features(som,kmeans,risk_map,X_train_scaled)
            X_val_augmented = self.extract_spatial_features(som,kmeans,risk_map,X_val_scaled)

            n_raw_features = X_train.shape[1]
            cat_features_indices = [
                n_raw_features -1
            ]
            #Downstream classifier
            clf = HistGradientBoostingClassifier(
                categorical_features = cat_features_indices,
                class_weight = 'balanced',
                random_state = self.cfg.seed,
                max_iter = 150)
            clf.fit(X_train_augmented,Y_train)

            #Predict Out-of-fold Default Probabilites
            val_probs = clf.predict_proba(X_val_augmented)[:, 1]
            oof_probs[val_idx] = val_probs
            fold_auc = roc_auc_score(Y_val, val_probs)

            metrics_history.append(
                {"fold": fold, "qe": qe, "te": te, "auc": fold_auc}
            )
            logger.info(f'Fold {fold} -QE {qe:.4f} -TE {te:.4f} | Downstream AUC: {fold_auc}')

        #find average
        avg_qe = np.mean([m["qe"] for m in metrics_history])
        avg_te = np.mean([m["te"] for m in metrics_history])
        auc = roc_auc_score(self.labels,oof_probs)

        #F! score
        precisions, recalls, thresholds = precision_recall_curve(self.labels,oof_probs)
        f1_score = 2* (precisions*recalls) /(precisions+recalls+1e-10)
        best_idx = int(np.argmax(f1_score))
        best_threshold = float(thresholds[best_idx])
        best_f1 = float(f1_score[best_idx]) 

        metrics_history.append({'Mean QE': avg_qe,'Mean TE': avg_te,'roc_auc':auc,'f1_score': best_f1,'threshold': best_threshold})

        oof_binary = (oof_probs >= best_threshold).astype(int)

        logger.info('--Metric Summary--')
        logger.info(f"Mean QE: {avg_qe:.5f} | Mean TE: {avg_te:.5f}")
        logger.info(f'OOF ROC-AUC: {auc:.4f}')
        logger.info(f"Optimized F1 score : {best_f1:.4f} at Threshold = {best_threshold:.4f} ")
        print("\nClassification Report at Optimal Threshold: \n",classification_report(self.labels,oof_binary))
        return metrics_history

    def train_fullModel(self) -> MiniSom:
        logger.info(
            "Fitting Final SOM on complete 50,000 samples"
        )
        #SimpleImputer
        imputer = SimpleImputer(strategy='median')
        data_imputed = imputer.fit_transform(self.data)
        #Quantile Scaler
        prod_scaler = QuantileTransformer(
                output_distribution="uniform",
                random_state=self.cfg.seed,
            )
        data_scaled = prod_scaler.fit_transform(data_imputed)

        #Production model
        som = self.create_som(data_scaled)
        som = self.train_som(som, data_scaled)

        #node risk map for visualization 
        risk_map=self.build_risk_map(som,data_scaled,self.labels)

        #K-Means
        codebook = som.get_weights().reshape(-1,data_scaled.shape[1])
        kmeans = KMeans(
            n_clusters=self.cfg.n_clusters,
            random_state=self.cfg.seed,
            n_init=10).fit(codebook)

        #augmented
        data_augmented = self.extract_spatial_features(som,kmeans,risk_map,data_scaled)

        #classifier
        clf = HistGradientBoostingClassifier(
            class_weight = 'balanced',
            random_state = self.cfg.seed, 
            max_iter = 150)
        clf.fit(data_augmented,self.labels)


        self.cfg.save_path.parent.mkdir(parents=True, exist_ok =True)

        joblib.dump(imputer,self.cfg.imputer_path)
        joblib.dump(som, self.cfg.save_path)
        joblib.dump(prod_scaler,self.cfg.scaler_path)
        joblib.dump(risk_map,self.cfg.map_path)
        joblib.dump(kmeans, self.cfg.kmeans_path)
        joblib.dump(clf,self.cfg.classifier_path)

        logger.info(f"Production Model  saved to: {self.cfg.save_path}")
        logger.info(f"Scaler Model  saved to: {self.cfg.scaler_path}")
        logger.info(f"Risk Map Model  saved to: {self.cfg.map_path}")
        logger.info(f"Kmeans Model  saved to: {self.cfg.kmeans_path}")
        logger.info(f"Classifier Model  saved to: {self.cfg.classifier_path}")
        return som
    
if __name__ == "__main__":
    BASE_DIR= Path(__file__).resolve().parent
    data_path = BASE_DIR/'data'/'processed'/'cleaned_data.csv'
    df= pd.read_csv(data_path)
    y_labels = df['target'].values
    pipeline = SOMPipeline(labels=y_labels)
    #cv_metrics = pipeline.cross_validation()
    pipeline.train_fullModel()


