"""
CICIDS2017 Dataset Loader and Preprocessor
Downloads and preprocesses CICIDS2017 network intrusion dataset
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Tuple, Optional
from sklearn.preprocessing import StandardScaler, LabelEncoder
import urllib.request
import zipfile
import os


CICIDS2017_URLS = {
    "monday": "http://205.174.165.80/CICDataset/CICIDS2017/Dataset/CSVs/Monday-WorkingHours.pcap_ISCX.csv",
    "tuesday": "http://205.174.165.80/CICDataset/CICIDS2017/Dataset/CSVs/Tuesday-WorkingHours.pcap_ISCX.csv",
    "wednesday": "http://205.174.165.80/CICDataset/CICIDS2017/Dataset/CSVs/Wednesday-workingHours.pcap_ISCX.csv",
    "thursday": "http://205.174.165.80/CICDataset/CICIDS2017/Dataset/CSVs/Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv",
    "friday": "http://205.174.165.80/CICDataset/CICIDS2017/Dataset/CSVs/Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
}


def download_cicids2017(data_dir: str = "ml/data/cicids2017") -> Path:
    """Download CICIDS2017 CSV files"""
    data_path = Path(data_dir)
    data_path.mkdir(parents=True, exist_ok=True)
    
    for day, url in CICIDS2017_URLS.items():
        filepath = data_path / f"{day}.csv"
        if not filepath.exists():
            print(f"Downloading {day}...")
            try:
                urllib.request.urlretrieve(url, filepath)
                print(f"Saved to {filepath}")
            except Exception as e:
                print(f"Failed to download {day}: {e}")
    
    return data_path


def load_cicids2017(data_dir: str = "ml/data/cicids2017", 
                   combine: bool = True,
                   remove_inf: bool = True,
                   remove_na: bool = True) -> pd.DataFrame:
    """
    Load CICIDS2017 dataset
    
    Args:
        data_dir: Directory containing CSV files
        combine: Whether to combine all days into single DataFrame
        remove_inf: Remove infinite values
        remove_na: Remove rows with NA values
    
    Returns:
        DataFrame with network traffic data
    """
    data_path = Path(data_dir)
    
    if not data_path.exists():
        print(f"Data directory not found: {data_dir}")
        print("Attempting to download...")
        data_path = download_cicids2017(data_dir)
    
    csv_files = list(data_path.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {data_dir}")
    
    dfs = []
    for csv_file in csv_files:
        print(f"Loading {csv_file.name}...")
        df = pd.read_csv(csv_file)
        df['source_file'] = csv_file.name
        dfs.append(df)
    
    if combine:
        df = pd.concat(dfs, ignore_index=True)
    else:
        return dfs
    
    # Clean column names
    df.columns = df.columns.str.strip()
    
    # Handle infinite values
    if remove_inf:
        df = df.replace([np.inf, -np.inf], np.nan)
    
    # Handle NA values
    if remove_na:
        df = df.dropna()
    
    print(f"Loaded CICIDS2017: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


def preprocess_cicids2017(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Preprocess CICIDS2017 dataset for ML
    
    Args:
        df: Raw CICIDS2017 DataFrame
    
    Returns:
        X: Features DataFrame
        y: Binary labels (0=Benign, 1=Attack)
    """
    # CICIDS2017 label column is typically 'Label' or ' Class'
    label_col = None
    for col in df.columns:
        if col.strip().lower() in ['label', 'class']:
            label_col = col
            break
    
    if label_col is None:
        raise ValueError("Label column not found. Columns: " + str(df.columns.tolist()))
    
    # Create binary labels
    df['label_binary'] = (df[label_col].str.strip().str.upper() != "BENIGN").astype(int)
    
    # Drop non-feature columns
    drop_cols = [label_col, 'label_binary', 'source_file', 'Timestamp', 'Flow ID', 
                 'Src IP', 'Dst IP', 'Src Port', 'Dst Port']
    drop_cols = [c for c in drop_cols if c in df.columns]
    
    X = df.drop(columns=drop_cols + ['label_binary'], errors='ignore')
    y = df['label_binary']
    
    # Convert to numeric
    X = X.apply(pd.to_numeric, errors='coerce')
    
    # Fill remaining NAs
    X = X.fillna(0)
    
    print(f"Preprocessed: {X.shape[1]} features, {y.sum()} attacks out of {len(y)} samples")
    print(f"Attack types: {df[label_col].value_counts().to_dict()}")
    
    return X, y


def get_cicids2017_stats(df: pd.DataFrame) -> dict:
    """Get statistics about CICIDS2017 dataset"""
    label_col = [c for c in df.columns if c.strip().lower() in ['label', 'class']][0]
    
    stats = {
        "total_flows": len(df),
        "unique_src_ips": df['Src IP'].nunique() if 'Src IP' in df.columns else None,
        "unique_dst_ips": df['Dst IP'].nunique() if 'Dst IP' in df.columns else None,
        "attack_distribution": df[label_col].value_counts().to_dict(),
        "duration_stats": df['Flow Duration'].describe().to_dict() if 'Flow Duration' in df.columns else None,
    }
    
    return stats


# Example usage
if __name__ == "__main__":
    # Load data
    df = load_cicids2017("ml/data/cicids2017")
    
    # Get stats
    stats = get_cicids2017_stats(df)
    print("\nDataset Statistics:")
    for key, val in stats.items():
        print(f"  {key}: {val}")
    
    # Preprocess for ML
    X, y = preprocess_cicids2017(df)
    print(f"\nFinal dataset: X.shape={X.shape}, y.shape={y.shape}")
