import os
from typing import Union,List,Dict
import joblib
import numpy as np 
import pandas as pd

FEATURE_NAMES = [
    "annual_income",
    "dti",
    "loan_amount",
    "acc_open_past_24mths",
    "bc_util",
    "lti",
    "interest_burden",
    "sub_grade_num",
    "int_rate",
    "revol_util",
    "term_months",
]

class RiskEngine:
    def __init__ (self,model_dir:str = 'models', anchor_threshold: float = 0.20):
        self.scaler = joblib.load(os.path.join(model_dir,'som_scaler.pkl'))
        self.quantile_scaler =joblib.load(os.path.join(model_dir,'som_quantile_scaler.pkl'))
        self.som = joblib.load(os.path.join(model_dir,'trained_credit_som.pkl'))
        self.kmeans = joblib.load(os.path.join(model_dir,'som_kmeans_clusters.pkl'))
        self.node_risk_map = joblib.load(os.path.join(model_dir,'node_risk_map.pkl'))
        self.clf = joblib.load(os.path.join(model_dir,'hybrid_credit_classifier.pkl'))

        self.anchor_threshold = anchor_threshold
        self.weights = self.som.get_weights()
        rows, cols, n_features = self.weights.shape
        self.cols = cols
        flat_weights = self.weights.reshape(-1,n_features)
        self.node_clusters = self.kmeans.predict(flat_weights)

    def assign_risk_tier(self,prob:float)->dict:
        p_star = self.anchor_threshold

        if prob < (p_star * 0.6):
            return {
                'tier_code':'TIER_A',
                'tier_name' : 'Tier A',
                'risk_level' : 'LOW',
                'action_code' : 'APPROVE',
                'rate_markup' : 0.00,
                'ui_badge_color' : 'green',
            }
        elif prob < p_star:
            return {
                'tier_code':'TIER_B',
                'tier_name' : 'Tier B',
                'risk_level' : 'MODERATE',
                'action_code' : 'APPROVE',
                'rate_markup' : 0.025,
                'ui_badge_color' : 'blue',
            }
        elif prob <(p_star*1.4):
            return {
                'tier_code':'TIER_C',
                'tier_name' : 'Tier C',
                'risk_level' : 'ELEVATED',
                'action_code' : 'MANUAL_REVIEW',
                'rate_markup' : 0.060,
                'ui_badge_color' : 'yellow',
            }
        else:
            return {
                'tier_code':'TIER_D',
                'tier_name' : 'Tier D',
                'risk_level' : 'HIGH',
                'action_code' : 'DECLINED',
                'rate_markup' : 0.00,
                'ui_badge_color' : 'red',
            }

    def predict_risk(
            self, X_raw :Union[np.ndarray,list,pd.DataFrame]
    ) -> List[Dict]:
        if isinstance(X_raw,pd.DataFrame):
            X_raw_np = X_raw.to_numpy()
        else:
            X_raw_np = np.asarray(X_raw)

        if X_raw_np.ndim ==1:
            X_raw_np = X_raw_np.reshape(1,-1)
        elif (
            X_raw_np.ndim ==2
            and X_raw_np.shape[1] != len(FEATURE_NAMES)
            and X_raw_np.shape[0] == len(FEATURE_NAMES)
        ) : 
            X_raw_np = X_raw_np.T
        
        X_processed = self.scaler.transform(X_raw_np)
        X_quantile = self.quantile_scaler.transform(X_processed)

        n_samples = X_raw_np.shape[0]
        spatial_features = []
        for sample in X_quantile:
            bmu_x,bmu_y = self.som.winner(sample)
            bmu_vector = self.weights[bmu_x,bmu_y]

            q_dist = np.linalg.norm(sample-bmu_vector)

            flat_idx = bmu_x * self.cols+bmu_y
            cluster_id = self.node_clusters[flat_idx]

            spatial_features.append([q_dist,cluster_id])

        X_augmented = np.column_stack([X_processed,np.array(spatial_features)])
        raw_probs = self.clf.predict_proba(X_augmented)
        default_probs = raw_probs[:,1].tolist()
          
        q_dist_list = [float(sf[0])for sf in spatial_features]
        cluster_list = [int(sf[1]) for sf in spatial_features]

        results = []
        for i in range(n_samples):
            probs = round(float(default_probs[i]),4)
            tier_info = self.assign_risk_tier(probs)
            record = {
                    "default_probability": probs,
                    'tier' : tier_info,
                    'spatial_metrics':{
                    "macro_cluster": cluster_list[i],
                    "quantization_distance": round(q_dist_list[i], 4),
                    }
                }
            results.append(record)
        return results
        

if __name__ == "__main__" :
    engine = RiskEngine(model_dir='models')

    #sample
    dummy_input = [[
        75000.0, 
        16.5,  
        12000.0,  
        2.0,  
        42.5,  
        0.16,  
        1800.0,  
        30.0,  
        0.01,  
        38.2,  
        48.0,  
    ]]

    results = engine.predict_risk(dummy_input)
    print('---Model Output---')
    import json
    print(json.dumps(results,indent = 2))