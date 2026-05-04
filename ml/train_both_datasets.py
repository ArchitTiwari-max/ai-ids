"""
Train XGBoost on both CICIDS2017 and UNSW-NB15 datasets
Compare performance side-by-side
"""

import argparse
import json
import warnings
from pathlib import Path
from typing import Dict, Tuple, List, Optional
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, roc_auc_score, accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

try:
    import xgboost as xgb
except ImportError:
    raise ImportError("XGBoost not installed. Run: pip install xgboost")

from cicids2017_loader import load_cicids2017, preprocess_cicids2017
from unsw_nb15_loader import load_unsw_nb15, preprocess_unsw_nb15

warnings.filterwarnings('ignore')


def create_xgboost_model():
    """Create optimized XGBoost classifier"""
    return xgb.XGBClassifier(
        n_estimators=500,
        max_depth=10,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        scale_pos_weight='balanced',
        random_state=42,
        n_jobs=-1,
        eval_metric='logloss',
        reg_alpha=0.01,
        reg_lambda=1.0,
        min_child_weight=3,
        gamma=0.1,
    )


def build_preprocessor(numeric_cols: List[str], categorical_cols: List[str]):
    """Build preprocessing pipeline"""
    numeric_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    categorical_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    preprocessor = ColumnTransformer([
        ('num', numeric_pipeline, numeric_cols),
        ('cat', categorical_pipeline, categorical_cols)
    ], remainder='drop')
    
    return preprocessor


def train_and_evaluate(X: pd.DataFrame, y: pd.Series, dataset_name: str) -> Tuple[Pipeline, Dict]:
    """
    Train XGBoost on a dataset and return metrics
    
    Returns:
        pipeline: Trained sklearn pipeline
        metrics: Dictionary of performance metrics
    """
    print(f"\n{'='*70}")
    print(f"Training XGBoost on {dataset_name}")
    print(f"{'='*70}")
    print(f"Dataset shape: {X.shape}")
    print(f"Class distribution: {y.value_counts().to_dict()}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"Train: {len(X_train)}, Test: {len(X_test)}")
    
    # Identify column types
    numeric_cols = X_train.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = X_train.select_dtypes(include=['object', 'category']).columns.tolist()
    
    print(f"Numeric features: {len(numeric_cols)}, Categorical: {len(categorical_cols)}")
    
    # Build preprocessor
    preprocessor = build_preprocessor(numeric_cols, categorical_cols)
    
    # Create model
    model = create_xgboost_model()
    
    # Build pipeline
    pipe = Pipeline([
        ('preprocessor', preprocessor),
        ('classifier', model)
    ])
    
    # Train
    start_time = time.time()
    pipe.fit(X_train, y_train)
    train_time = time.time() - start_time
    
    # Predict
    y_pred = pipe.predict(X_test)
    y_proba = pipe.predict_proba(X_test)[:, 1]
    
    # Calculate metrics
    metrics = {
        'dataset': dataset_name,
        'accuracy': accuracy_score(y_test, y_pred),
        'precision': precision_score(y_test, y_pred),
        'recall': recall_score(y_test, y_pred),
        'f1_score': f1_score(y_test, y_pred),
        'roc_auc': roc_auc_score(y_test, y_proba),
        'train_time_seconds': train_time,
        'n_samples': len(X),
        'n_features': X.shape[1],
        'n_numeric': len(numeric_cols),
        'n_categorical': len(categorical_cols),
        'attack_ratio': float(y.mean()),
    }
    
    # Print results
    print(f"\n📊 Results for {dataset_name}:")
    print(f"   Accuracy:  {metrics['accuracy']:.4f} ({metrics['accuracy']*100:.2f}%)")
    print(f"   Precision: {metrics['precision']:.4f} ({metrics['precision']*100:.2f}%)")
    print(f"   Recall:    {metrics['recall']:.4f} ({metrics['recall']*100:.2f}%)")
    print(f"   F1 Score:  {metrics['f1_score']:.4f} ({metrics['f1_score']*100:.2f}%)")
    print(f"   ROC-AUC:   {metrics['roc_auc']:.4f}")
    print(f"   Train Time: {train_time:.2f} seconds")
    
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Normal', 'Attack']))
    
    return pipe, metrics


def save_model_comparison(cicids_metrics: Dict, unsw_metrics: Dict, output_dir: Path):
    """Save comparison results and create summary"""
    
    comparison = {
        'cicids2017': cicids_metrics,
        'unsw_nb15': unsw_metrics,
        'winner': None,
        'comparison_time': pd.Timestamp.now().isoformat()
    }
    
    # Determine winner based on accuracy
    if cicids_metrics['accuracy'] > unsw_metrics['accuracy']:
        comparison['winner'] = 'CICIDS2017'
        comparison['accuracy_difference'] = cicids_metrics['accuracy'] - unsw_metrics['accuracy']
    else:
        comparison['winner'] = 'UNSW-NB15'
        comparison['accuracy_difference'] = unsw_metrics['accuracy'] - cicids_metrics['accuracy']
    
    # Save JSON
    with open(output_dir / 'dataset_comparison.json', 'w') as f:
        json.dump(comparison, f, indent=2)
    
    # Print comparison table
    print(f"\n{'='*70}")
    print("DATASET COMPARISON SUMMARY")
    print(f"{'='*70}")
    
    print(f"\n{'Metric':<20} {'CICIDS2017':<15} {'UNSW-NB15':<15} {'Winner':<15}")
    print("-" * 70)
    
    metrics_to_compare = ['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc', 'train_time_seconds']
    
    for metric in metrics_to_compare:
        c_val = cicids_metrics.get(metric, 0)
        u_val = unsw_metrics.get(metric, 0)
        
        if metric == 'train_time_seconds':
            c_str = f"{c_val:.2f}s"
            u_str = f"{u_val:.2f}s"
            # Lower is better for time
            winner = 'CICIDS2017' if c_val < u_val else 'UNSW-NB15'
        else:
            c_str = f"{c_val*100:.2f}%" if metric != 'roc_auc' else f"{c_val:.4f}"
            u_str = f"{u_val*100:.2f}%" if metric != 'roc_auc' else f"{u_val:.4f}"
            winner = 'CICIDS2017' if c_val > u_val else 'UNSW-NB15'
        
        print(f"{metric:<20} {c_str:<15} {u_str:<15} {winner:<15}")
    
    print(f"\n{'='*70}")
    print(f"🏆 OVERALL WINNER: {comparison['winner']}")
    print(f"   Accuracy Difference: {comparison['accuracy_difference']*100:.2f}%")
    print(f"{'='*70}")
    
    return comparison


def main():
    parser = argparse.ArgumentParser(
        description="Train XGBoost on both CICIDS2017 and UNSW-NB15 and compare"
    )
    parser.add_argument("--cicids-path", default="ml/data/cicids2017", 
                       help="Path to CICIDS2017 data")
    parser.add_argument("--unsw-path", default="ml/data/unsw_nb15",
                       help="Path to UNSW-NB15 data")
    parser.add_argument("--output-dir", default="ml/models",
                       help="Output directory for models")
    parser.add_argument("--nrows", type=int, default=None,
                       help="Limit rows for faster training")
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    results = {}
    
    # Train on CICIDS2017
    try:
        print("\n📥 Loading CICIDS2017 dataset...")
        df_cicids = load_cicids2017(args.cicids_path)
        X_cicids, y_cicids = preprocess_cicids2017(df_cicids)
        
        if args.nrows:
            X_cicids = X_cicids.head(args.nrows)
            y_cicids = y_cicids.head(args.nrows)
        
        pipe_cicids, metrics_cicids = train_and_evaluate(X_cicids, y_cicids, "CICIDS2017")
        
        # Save model
        joblib.dump({
            'pipeline': pipe_cicids,
            'dataset': 'CICIDS2017',
            'metrics': metrics_cicids
        }, output_dir / "model_cicids2017_xgboost.joblib")
        print(f"✅ Saved CICIDS2017 model to {output_dir}/model_cicids2017_xgboost.joblib")
        
        results['cicids2017'] = metrics_cicids
        
    except Exception as e:
        print(f"❌ Error training on CICIDS2017: {e}")
        results['cicids2017'] = None
    
    # Train on UNSW-NB15
    try:
        print("\n📥 Loading UNSW-NB15 dataset...")
        df_unsw = load_unsw_nb15(args.unsw_path, use_split="training")
        X_unsw, y_unsw = preprocess_unsw_nb15(df_unsw)
        
        if args.nrows:
            X_unsw = X_unsw.head(args.nrows)
            y_unsw = y_unsw.head(args.nrows)
        
        pipe_unsw, metrics_unsw = train_and_evaluate(X_unsw, y_unsw, "UNSW-NB15")
        
        # Save model
        joblib.dump({
            'pipeline': pipe_unsw,
            'dataset': 'UNSW-NB15',
            'metrics': metrics_unsw
        }, output_dir / "model_unsw_nb15_xgboost.joblib")
        print(f"✅ Saved UNSW-NB15 model to {output_dir}/model_unsw_nb15_xgboost.joblib")
        
        results['unsw_nb15'] = metrics_unsw
        
    except Exception as e:
        print(f"❌ Error training on UNSW-NB15: {e}")
        results['unsw_nb15'] = None
    
    # Compare if both succeeded
    if results['cicids2017'] and results['unsw_nb15']:
        comparison = save_model_comparison(
            results['cicids2017'], 
            results['unsw_nb15'],
            output_dir
        )
        
        # Create a dashboard-compatible metrics file
        dashboard_metrics = {
            'cicids2017': {
                'accuracy': round(results['cicids2017']['accuracy'] * 100, 2),
                'precision': round(results['cicids2017']['precision'] * 100, 2),
                'recall': round(results['cicids2017']['recall'] * 100, 2),
                'f1_score': round(results['cicids2017']['f1_score'] * 100, 2),
                'model_type': 'xgboost'
            },
            'unsw_nb15': {
                'accuracy': round(results['unsw_nb15']['accuracy'] * 100, 2),
                'precision': round(results['unsw_nb15']['precision'] * 100, 2),
                'recall': round(results['unsw_nb15']['recall'] * 100, 2),
                'f1_score': round(results['unsw_nb15']['f1_score'] * 100, 2),
                'model_type': 'xgboost'
            }
        }
        
        with open(output_dir / 'dashboard_metrics_both.json', 'w') as f:
            json.dump(dashboard_metrics, f, indent=2)
        
        print(f"\n📄 Saved dashboard metrics to {output_dir}/dashboard_metrics_both.json")
    
    print(f"\n✨ Training complete! Check {output_dir}/ for saved models and results.")


if __name__ == "__main__":
    main()
