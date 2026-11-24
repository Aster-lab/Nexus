from pathlib import Path
import pandas as pd
import numpy as np
from typing import Optional,Dict
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent.parent
file_path = BASE_DIR / 'data' /'raw'/'loan.csv'
output_path = BASE_DIR /'data'/'processed'/'cleaned_data.csv'

class Preporcessor:

    use_cols =[
          'annual_inc',
          'dti',
          'loan_amnt',
          'acc_open_past_24mths',
          'bc_util',
          'sub_grade',
          'int_rate',
          'revol_util',
          'term',
          'loan_status',
    ]

    target_map = {'Fully Paid':0,'Charged Off':1,'Default':1}

    columns = {
          'annual_inc': 'annual_income',
          'loan_amnt' : 'loan_amount',
     }

    final_cols =[
               'annual_income',
               'dti',
               'loan_amount',
               'acc_open_past_24mths',
               'bc_util',
               'lti',
               'interest_burden',
               'sub_grade_num',
               'int_rate',
               'revol_util',
               'term_months',
               'target',
          ]

    outlier_cap : Dict [str,float] = {
          'annual_inc': 0.99,
          'dti': 0.99,
          'revol_util': 0.995,
          'bc_util': 0.995,
          'acc_open_past_24mths': 0.99,
          'lti':0.99,
          'interest_burden': 0.99
     }

    def __init__(
          self,
          raw_path:Path,
          output_path:Path,
          chunksize:int = 50000,
          sample_size: Optional[int]=50000,
          random_state: int = 42,
     ):
        self.raw_path = raw_path
        self.output_path = output_path
        self.chunk_size = chunksize
        self.sample_size = sample_size
        self.random_state = random_state

        grades = [f'{g}{i}' for g in 'ABCDEFG' for i in range(1,6)]
        self.grade_map = {grade:idx +1 for idx,grade in enumerate(grades)}

    def  clean_chunk(self,chunk: pd.DataFrame) -> pd.DataFrame:
        chunk = chunk.drop_duplicates()

        chunk = chunk[chunk['loan_status'].isin(self.target_map.keys())].copy()
        chunk['target'] = chunk['loan_status'].map(self.target_map).astype('int64')

        for col in ['int_rate','revol_util','bc_util']:
            if col in chunk.columns and chunk[col].dtype == object:
                chunk[col] = (
                chunk[col].astype(str).str.rstrip('%').astype(float)
                )
            if col in chunk.columns and chunk[col].max() > 1.0:
                chunk[col] = chunk[col]/100.0

        chunk['term_months'] = pd.to_numeric(
            chunk['term'].astype(str).str.extract(r'(\d+)',expand = False),
            errors = 'coerce'
        )

        chunk['sub_grade_num'] = chunk['sub_grade'].map(self.grade_map)

        num_cols = ['annual_inc','dti','loan_amnt','acc_open_past_24mths']
        for col in num_cols:
            chunk[col]=pd.to_numeric(chunk[col],errors = 'coerce')

        chunk = chunk.dropna(
            subset=['annual_inc','loan_amnt','sub_grade_num','target']
          )

        return chunk[(chunk["annual_inc"] > 0) & (chunk["loan_amnt"] >= 500)]

    def impute_domain_specification(self,df:pd.DataFrame) -> pd.DataFrame:
        df.copy()

        for col in ['bc_util','acc_open_past_24_mths','revol_util']:
            if col in df.columns and df[col].isnull().sum()>0:
                df[f'{col}_is_missing'] = df[col].isnull().astype(int)

        if 'acc_open_past_24mths' in df.columns:
            df["acc_open_past_24mths"] = df["acc_open_past_24mths"].fillna(0)

        if 'bc_util' in df.columns and 'revol_util' in df.columns:
            df['bc_util']=df['bc_util'].fillna(df['revol_util'])

        strat_cols =['dti','revol_util','bc_util']
        for col in strat_cols:
            if col in df.columns and df[col].isnull().sum() >0:
                median = df.groupby('sub_grade_num')[col]. transform('median')
                df[col] = df[col].fillna(median).fillna(df[col].median())

        return df

    def cap_outliers(self,df:pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        for col, quantile in self.outlier_cap.items():
            if col in df.columns:
                cap_value = df[col].quantile(quantile)
                df[col] = df[col].clip(upper=cap_value)

        return df

    def feature_engineer(self,df:pd.DataFrame)->pd.DataFrame:
        df = df.copy()

        df['lti'] = np.round(df['loan_amnt']/(df['annual_inc']+1.0),4)
        df['interest_burden'] = np.round(
            (df['loan_amnt'] * df['int_rate']) / (df['annual_inc']+1.0),4
        )

        return df.rename(columns=self.columns)

    def run(self) -> pd.DataFrame:
        print(f"Raw data from : {self.raw_path}")
        chunk_list = []

        for i,chunk in enumerate(
            pd.read_csv(
                self.raw_path,
                usecols = self.use_cols,
                chunksize = self.chunk_size,
                low_memory = False
            )
        ):
            cleaned_chunk = self.clean_chunk(chunk)
            chunk_list.append(cleaned_chunk)
            print(f"Processing chunk: {i+1}...")

        df = pd.concat(chunk_list,ignore_index=True).drop_duplicates()
        df = self.impute_domain_specification(df)
        df = self.feature_engineer(df)
        df = self.cap_outliers(df)

        clean_df = df[[c for c in self.final_cols if c in df.columns]].copy()

        if self.sample_size and len(clean_df) > self.sample_size:
            clean_df,_ = train_test_split(
                clean_df,
                train_size = self.sample_size,
                stratify = clean_df['target'],
                random_state = self.random_state,
            )

        self.output_path.parent.mkdir(parents = True, exist_ok = True)
        clean_df.to_csv(self.output_path,index = False)

        print(f"\nSaved clean dataset to: {self.output_path}")
        print(
            f"Export Shape: {clean_df.shape} | Baseline Default Rate:"
            f" {clean_df['target'].mean():.2%}"
        )
        return clean_df

if __name__ == '__main__':
    pipeline = Preporcessor(
        raw_path = file_path,
        output_path = output_path,
        sample_size =50000,
    )

    pipeline.run()



