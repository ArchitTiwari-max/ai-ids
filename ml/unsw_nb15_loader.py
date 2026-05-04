"""
UNSW-NB15 Dataset Loader and Preprocessor
Downloads and preprocesses UNSW-NB15 network intrusion dataset
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Tuple, Optional, Dict
from sklearn.preprocessing import StandardScaler, LabelEncoder
import urllib.request


UNSW_NB15_URLS = {
    "training": "https://cloudstor.aarnet.edu.au/plus/s/2DhnLGDdEECv4s7/download?path=%2F&files=UNSW_NB15_training-set.csv",
    "testing": "https://cloudstor.aarnet.edu.au/plus/s/2DhnLGDdEECv4s7/download?path=%2F&files=UNSW_NB15_testing-set.csv",
    "full": "https://cloudstor.aarnet.edu.au/plus/s/2DhnLGDdEECv4s7/download?path=%2F&files=UNSW-NB15_1.csv",
}


def download_unsw_nb15(data_dir: str = "ml/data/unsw_nb15") -> Path:
    """Download UNSW-NB15 CSV files"""
    data_path = Path(data_dir)
    data_path.mkdir(parents=True, exist_ok=True)
    
    for split, url in UNSW_NB15_URLS.items():
        filepath = data_path / f"unsw_nb15_{split}.csv"
        if not filepath.exists():
            print(f"Downloading UNSW-NB15 {split} set...")
            try:
                urllib.request.urlretrieve(url, filepath)
                print(f"Saved to {filepath}")
            except Exception as e:
                print(f"Failed to download {split}: {e}")
    
    return data_path


def load_unsw_nb15(data_dir: str = "ml/data/unsw_nb15",
                  use_split: str = "training",
                  combine_splits: bool = False) -> pd.DataFrame:
    """
    Load UNSW-NB15 dataset
    
    Args:
        data_dir: Directory containing CSV files
        use_split: Which split to load ('training', 'testing', or 'full')
        combine_splits: Whether to combine training and testing sets
    
    Returns:
        DataFrame with network traffic data
    """
    data_path = Path(data_dir)
    
    if not data_path.exists():
        print(f"Data directory not found: {data_dir}")
        print("Attempting to download...")
        data_path = download_unsw_nb15(data_dir)
    
    if combine_splits:
        train_path = data_path / "unsw_nb15_training.csv"
        test_path = data_path / "unsw_nb15_testing.csv"
        
        if train_path.exists() and test_path.exists():
            df_train = pd.read_csv(train_path)
            df_test = pd.read_csv(test_path)
            df_train['split'] = 'train'
            df_test['split'] = 'test'
            df = pd.concat([df_train, df_test], ignore_index=True)
            print(f"Loaded combined UNSW-NB15: {len(df)} rows")
        else:
            raise FileNotFoundError("Training or testing file not found")
    else:
        filepath = data_path / f"unsw_nb15_{use_split}.csv"
        if not filepath.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        
        df = pd.read_csv(filepath)
        df['split'] = use_split
        print(f"Loaded UNSW-NB15 {use_split}: {len(df)} rows")
    
    return df


def preprocess_unsw_nb15(df: pd.DataFrame, 
                         encode_categorical: bool = True,
                         scale_numeric: bool = False) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Preprocess UNSW-NB15 dataset for ML
    
    Args:
        df: Raw UNSW-NB15 DataFrame
        encode_categorical: Whether to encode categorical features
        scale_numeric: Whether to scale numeric features
    
    Returns:
        X: Features DataFrame
        y: Binary labels (0=Normal, 1=Attack)
    """
    df = df.copy()
    
    # UNSW-NB15 label columns
    # 'label' is binary (0=normal, 1=attack)
    # 'attack_cat' is multi-class attack category
    
    if 'label' in df.columns:
        y = df['label'].astype(int)
    else:
        raise ValueError("'label' column not found")
    
    # Drop non-feature columns
    drop_cols = ['label', 'attack_cat', 'split', 'id']
    drop_cols = [c for c in drop_cols if c in df.columns]
    
    X = df.drop(columns=drop_cols, errors='ignore')
    
    # Identify categorical columns
    categorical_cols = ['proto', 'service', 'state']
    categorical_cols = [c for c in categorical_cols if c in X.columns]
    
    # Encode categoricals
    if encode_categorical:
        encoders = {}
        for col in categorical_cols:
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            encoders[col] = le
    
    # Scale numerics
    if scale_numeric:
        numeric_cols = X.select_dtypes(include=[np.number]).columns
        scaler = StandardScaler()
        X[numeric_cols] = scaler.fit_transform(X[numeric_cols])
    
    print(f"Preprocessed: {X.shape[1]} features")
    print(f"Attack distribution: {y.value_counts().to_dict()}")
    
    if 'attack_cat' in df.columns:
        print(f"\nAttack categories:\n{df['attack_cat'].value_counts()}")
    
    return X, y


def get_attack_categories(df: pd.DataFrame) -> Dict[str, int]:
    """Get attack category distribution from UNSW-NB15"""
    if 'attack_cat' not in df.columns:
        return {}
    
    return df['attack_cat'].value_counts().to_dict()


def get_feature_importance_unsw() -> Dict[str, str]:
    """Get description of important features in UNSW-NB15"""
    features = {
        'dur': 'Record total duration',
        'proto': 'Transaction protocol',
        'service': 'Network service',
        'state': 'State of the connection',
        'spkts': 'Source to destination packet count',
        'dpkts': 'Destination to source packet count',
        'sbytes': 'Source to destination bytes',
        'dbytes': 'Destination to source bytes',
        'rate': 'Connection rate',
        'sttl': 'Source TTL',
        'dttl': 'Destination TTL',
        'sload': 'Source load',
        'dload': 'Destination load',
        'sloss': 'Source packet loss',
        'dloss': 'Destination packet loss',
        'sinpkt': 'Source inter-packet arrival time',
        'dinpkt': 'Destination inter-packet arrival time',
        'sjit': 'Source jitter',
        'djit': 'Destination jitter',
        'swin': 'Source TCP window size',
        'stcpb': 'Source TCP base sequence',
        'dtcpb': 'Destination TCP base sequence',
        'dwin': 'Destination TCP window size',
        'tcprtt': 'TCP RTT',
        'synack': 'SYN to ACK time',
        'ackdat': 'ACK to data time',
        'smean': 'Mean of source packet size',
        'dmean': 'Mean of destination packet size',
        'trans_depth': 'HTTP transaction depth',
        'response_body_len': 'HTTP response body length',
        'ct_srv_src': 'Connections to same service from source',
        'ct_state_ttl': 'Connections with same state and TTL',
        'ct_dst_ltm': 'Connections to same destination',
        'ct_src_ltm': 'Connections from same source',
        'ct_src_dport_ltm': 'Connections from same src to same dst port',
        'ct_dst_sport_ltm': 'Connections to same dst from same src port',
        'ct_dst_src_ltm': 'Connections between same src-dst pairs',
        'is_ftp_login': 'FTP login attempted',
        'ct_ftp_cmd': 'FTP commands count',
        'ct_flw_http_mthd': 'HTTP methods count',
        'ct_srv_dst': 'Connections to same service to destination',
        'is_sm_ips_ports': 'Source IP equals destination IP and ports equal',
    }
    return features


def compare_splits(train_df: pd.DataFrame, test_df: pd.DataFrame) -> dict:
    """Compare training and testing set distributions"""
    comparison = {
        "train_size": len(train_df),
        "test_size": len(test_df),
        "train_attacks": train_df['label'].sum() if 'label' in train_df.columns else 0,
        "test_attacks": test_df['label'].sum() if 'label' in test_df.columns else 0,
        "attack_rate_train": train_df['label'].mean() if 'label' in train_df.columns else 0,
        "attack_rate_test": test_df['label'].mean() if 'label' in test_df.columns else 0,
    }
    
    if 'attack_cat' in train_df.columns and 'attack_cat' in test_df.columns:
        comparison['train_categories'] = train_df['attack_cat'].value_counts().to_dict()
        comparison['test_categories'] = test_df['attack_cat'].value_counts().to_dict()
    
    return comparison


# Example usage
if __name__ == "__main__":
    # Load training set
    df_train = load_unsw_nb15("ml/data/unsw_nb15", use_split="training")
    
    # Load testing set
    df_test = load_unsw_nb15("ml/data/unsw_nb15", use_split="testing")
    
    # Compare splits
    stats = compare_splits(df_train, df_test)
    print("\nTrain/Test Comparison:")
    for key, val in stats.items():
        print(f"  {key}: {val}")
    
    # Preprocess training data
    X_train, y_train = preprocess_unsw_nb15(df_train)
    X_test, y_test = preprocess_unsw_nb15(df_test)
    
    print(f"\nFinal datasets:")
    print(f"  Train: X.shape={X_train.shape}, y.shape={y_train.shape}")
    print(f"  Test:  X.shape={X_test.shape}, y.shape={y_test.shape}")
    
    # Get feature descriptions
    print("\nImportant Features:")
    for feat, desc in list(get_feature_importance_unsw().items())[:10]:
        print(f"  {feat}: {desc}")
