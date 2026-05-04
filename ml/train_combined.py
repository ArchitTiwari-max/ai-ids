"""
Combined CICIDS2017 + UNSW-NB15 Trainer
Trains model on both datasets separately and compares performance
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Tuple

import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# Import the loaders
from cicids2017_loader import load_cicids2017, preprocess_cicids2017
from unsw_nb15_loader import load_unsw_nb15, preprocess_unsw_nb15


def train_on_dataset(X: pd.DataFrame, y: pd.Series, 
                     dataset_name: str,
                     model_type: str = "rf") -> Tuple[object, Dict]:
    """
    Train a model on a dataset and return metrics
    
    Args:
        X: Features
        y: Labels
        dataset_name: Name of dataset for logging
        model_type: 'rf' for RandomForest, 'gb' for GradientBoosting
    
    Returns:
        model: Trained model
        metrics: Dictionary of performance metrics
    """
    print(f"\n{'='*50}")
    print(f"Training on {dataset_name}")
    print(f"{'='*50}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model
    if model_type == "rf":
        model = RandomForestClassifier(
            n_estimators=200,
            max_depth=20,
            n_jobs=-1,
            class_weight='balanced',
            random_state=42
        )
    elif model_type == "gb":
        model = GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            random_state=42
        )
    else:
        raise ValueError(f"Unknown model type: {model_type}")
    
    model.fit(X_train_scaled, y_train)
    
    # Predictions
    y_pred = model.predict(X_test_scaled)
    y_proba = model.predict_proba(X_test_scaled)[:, 1] if hasattr(model, 'predict_proba') else None
    
    # Metrics
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    
    metrics = {
        'dataset': dataset_name,
        'model_type': model_type,
        'accuracy': accuracy_score(y_test, y_pred),
        'precision': precision_score(y_test, y_pred),
        'recall': recall_score(y_test, y_pred),
        'f1_score': f1_score(y_test, y_pred),
        'roc_auc': roc_auc_score(y_test, y_proba) if y_proba is not None else None,
        'n_samples': len(X),
        'n_features': X.shape[1],
        'attack_ratio': y.mean(),
    }
    
    print(f"\nClassification Report for {dataset_name}:")
    print(classification_report(y_test, y_pred, target_names=['Normal', 'Attack']))
    
    print(f"\nMetrics Summary:")
    for key, val in metrics.items():
        if isinstance(val, float):
            print(f"  {key}: {val:.4f}")
        else:
            print(f"  {key}: {val}")
    
    return model, metrics, scaler


def compare_datasets(metrics_cicids: Dict, metrics_unsw: Dict):
    """Print comparison of both datasets"""
    print(f"\n{'='*60}")
    print("DATASET COMPARISON")
    print(f"{'='*60}")
    
    print(f"\n{'Metric':<20} {'CICIDS2017':<15} {'UNSW-NB15':<15}")
    print("-" * 50)
    
    for metric in ['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc']:
        val_cicids = metrics_cicids.get(metric, 0) or 0
        val_unsw = metrics_unsw.get(metric, 0) or 0
        print(f"{metric:<20} {val_cicids:<15.4f} {val_unsw:<15.4f}")
    
    print(f"\n{'Dataset Characteristics':<20} {'CICIDS2017':<15} {'UNSW-NB15':<15}")
    print("-" * 50)
    print(f"{'Samples':<20} {metrics_cicids['n_samples']:<15} {metrics_unsw['n_samples']:<15}")
    print(f"{'Features':<20} {metrics_cicids['n_features']:<15} {metrics_unsw['n_features']:<15}")
    print(f"{'Attack Ratio':<20} {metrics_cicids['attack_ratio']:<15.4f} {metrics_unsw['attack_ratio']:<15.4f}")


def main():
    parser = argparse.ArgumentParser(description="Train on CICIDS2017 and UNSW-NB15")
    parser.add_argument("--cicids-path", default="ml/data/cicids2017", help="Path to CICIDS2017 data")
    parser.add_argument("--unsw-path", default="ml/data/unsw_nb15", help="Path to UNSW-NB15 data")
    parser.add_argument("--model-type", default="rf", choices=["rf", "gb"], help="Model type")
    parser.add_argument("--output-dir", default="ml/models", help="Output directory for models")
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    results = {}
    
    # Train on CICIDS2017
    try:
        print("Loading CICIDS2017...")
        df_cicids = load_cicids2017(args.cicids_path)
        X_cicids, y_cicids = preprocess_cicids2017(df_cicids)
        
        model_cicids, metrics_cicids, scaler_cicids = train_on_dataset(
            X_cicids, y_cicids, "CICIDS2017", args.model_type
        )
        
        # Save
        joblib.dump(model_cicids, output_dir / "model_cicids2017.joblib")
        joblib.dump(scaler_cicids, output_dir / "scaler_cicids2017.joblib")
        
        results['cicids2017'] = metrics_cicids
    except Exception as e:
        print(f"Error training on CICIDS2017: {e}")
        results['cicids2017'] = None
    
    # Train on UNSW-NB15
    try:
        print("\nLoading UNSW-NB15...")
        df_unsw = load_unsw_nb15(args.unsw_path, use_split="training")
        X_unsw, y_unsw = preprocess_unsw_nb15(df_unsw)
        
        model_unsw, metrics_unsw, scaler_unsw = train_on_dataset(
            X_unsw, y_unsw, "UNSW-NB15", args.model_type
        )
        
        # Save
        joblib.dump(model_unsw, output_dir / "model_unsw_nb15.joblib")
        joblib.dump(scaler_unsw, output_dir / "scaler_unsw_nb15.joblib")
        
        results['unsw_nb15'] = metrics_unsw
    except Exception as e:
        print(f"Error training on UNSW-NB15: {e}")
        results['unsw_nb15'] = None
    
    # Compare if both succeeded
    if results['cicids2017'] and results['unsw_nb15']:
        compare_datasets(results['cicids2017'], results['unsw_nb15'])
    
    # Save results
    with open(output_dir / "comparison_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\nResults saved to {output_dir}/comparison_results.json")


if __name__ == "__main__":
    main()
