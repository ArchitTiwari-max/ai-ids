"""
Unified Intrusion Detection using both CICIDS2017 and UNSW-NB15 models
Automatically detects dataset type and uses appropriate model
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Optional
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix


def detect_dataset_type(df: pd.DataFrame) -> str:
    """
    Automatically detect which dataset the input belongs to
    
    Returns:
        'cicids2017' or 'unsw_nb15'
    """
    columns = set(df.columns.str.strip().str.lower())
    
    # CICIDS2017 specific columns
    cicids_indicators = [
        'flow id', 'src ip', 'dst ip', 'flow duration', 
        'total fwd packets', 'total backward packets',
        'fwd packets length total', 'bwd packets length total'
    ]
    
    # UNSW-NB15 specific columns  
    unsw_indicators = [
        'dur', 'proto', 'service', 'state',
        'spkts', 'dpkts', 'sbytes', 'dbytes',
        'attack_cat', 'label'
    ]
    
    cicids_score = sum(1 for col in cicids_indicators if col in columns)
    unsw_score = sum(1 for col in unsw_indicators if col in columns)
    
    # Additional checks
    if 'attack_cat' in columns:
        return 'unsw_nb15'
    if 'flow id' in columns:
        return 'cicids2017'
    
    return 'cicids2017' if cicids_score >= unsw_score else 'unsw_nb15'


def load_model(model_path: str, dataset_type: str):
    """Load the appropriate model"""
    path = Path(model_path)
    
    if not path.exists():
        # Try default paths
        if dataset_type == 'cicids2017':
            path = Path('ml/models/model_cicids2017_xgboost.joblib')
        else:
            path = Path('ml/models/model_unsw_nb15_xgboost.joblib')
    
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")
    
    model_package = joblib.load(path)
    
    if isinstance(model_package, dict):
        return model_package.get('pipeline', model_package.get('model', model_package))
    return model_package


def predict_intrusion(df: pd.DataFrame, model, dataset_type: str) -> pd.DataFrame:
    """
    Run intrusion detection on data
    
    Returns:
        DataFrame with predictions added
    """
    # Store original columns
    original_cols = df.columns.tolist()
    
    # Preprocess based on dataset type
    if dataset_type == 'cicids2017':
        from cicids2017_loader import preprocess_cicids2017
        from train import infer_labels
        
        # Try to extract labels if present
        try:
            X, y_true, _ = infer_labels(df.copy(), None)
            has_labels = True
        except:
            X = df.copy()
            y_true = None
            has_labels = False
        
        # Drop non-feature columns
        drop_cols = ['source_file', 'Label', 'Class', 'timestamp']
        X = X.drop(columns=[c for c in drop_cols if c in X.columns], errors='ignore')
        
    else:  # unsw_nb15
        from unsw_nb15_loader import preprocess_unsw_nb15
        
        # Check if labels exist
        if 'label' in df.columns:
            y_true = df['label'].astype(int)
            has_labels = True
        else:
            y_true = None
            has_labels = False
        
        # Drop non-feature columns
        drop_cols = ['label', 'attack_cat', 'id']
        X = df.drop(columns=[c for c in drop_cols if c in df.columns], errors='ignore')
    
    # Ensure all columns are numeric that should be
    for col in X.columns:
        if X[col].dtype == 'object':
            try:
                X[col] = pd.to_numeric(X[col], errors='ignore')
            except:
                pass
    
    # Fill NaN values
    X = X.fillna(0)
    
    # Make predictions
    predictions = model.predict(X)
    probabilities = model.predict_proba(X)[:, 1]
    
    # Create results DataFrame
    results = df.copy()
    results['predicted_label'] = predictions
    results['attack_probability'] = probabilities
    results['prediction_confidence'] = np.where(
        probabilities > 0.5,
        probabilities,
        1 - probabilities
    )
    
    # Add attack type classification
    def classify_attack(row):
        if row['predicted_label'] == 0:
            return 'Normal'
        
        # Dataset-specific attack classification
        if dataset_type == 'cicids2017':
            # CICIDS2017 logic
            port = row.get('Destination Port', 0) if 'Destination Port' in row else 0
            dur = row.get('Flow Duration', 0) if 'Flow Duration' in row else 0
            fwd = row.get('Total Fwd Packets', 0) if 'Total Fwd Packets' in row else 0
            bwd = row.get('Total Backward Packets', 0) if 'Total Backward Packets' in row else 0
        else:
            # UNSW-NB15 logic
            port = row.get('sport', 0) if 'sport' in row else (row.get('dsport', 0) if 'dsport' in row else 0)
            dur = row.get('dur', 0) if 'dur' in row else 0
            fwd = row.get('spkts', 0) if 'spkts' in row else 0
            bwd = row.get('dpkts', 0) if 'dpkts' in row else 0
        
        if port == 22 and fwd > 100:
            return 'Brute Force'
        if dur > 50000 and fwd > 500 and bwd <= 2:
            return 'DDoS'
        if dur == 0 and bwd == 0:
            return 'Privilege Escalation'
        return 'Port Scanning'
    
    results['attack_type'] = results.apply(classify_attack, axis=1)
    
    # Evaluate if labels are available
    if has_labels and y_true is not None:
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        
        metrics = {
            'accuracy': accuracy_score(y_true, predictions),
            'precision': precision_score(y_true, predictions),
            'recall': recall_score(y_true, predictions),
            'f1_score': f1_score(y_true, predictions)
        }
        
        print(f"\n📊 Evaluation Results:")
        print(f"   Accuracy:  {metrics['accuracy']:.4f} ({metrics['accuracy']*100:.2f}%)")
        print(f"   Precision: {metrics['precision']:.4f}")
        print(f"   Recall:    {metrics['recall']:.4f}")
        print(f"   F1 Score:  {metrics['f1_score']:.4f}")
        
        print(f"\nClassification Report:")
        print(classification_report(y_true, predictions, target_names=['Normal', 'Attack']))
    
    # Summary
    n_attacks = (predictions == 1).sum()
    n_normal = (predictions == 0).sum()
    
    print(f"\n🛡️ Detection Summary:")
    print(f"   Total samples: {len(results)}")
    print(f"   Attacks detected: {n_attacks} ({n_attacks/len(results)*100:.2f}%)")
    print(f"   Normal traffic: {n_normal} ({n_normal/len(results)*100:.2f}%)")
    print(f"   Average confidence: {results['prediction_confidence'].mean()*100:.2f}%")
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Unified intrusion detection using XGBoost models"
    )
    parser.add_argument("--input", required=True, 
                       help="Input CSV file to analyze")
    parser.add_argument("--output", default=None,
                       help="Output CSV file for results")
    parser.add_argument("--model-path", default=None,
                       help="Path to model file (auto-detected if not provided)")
    parser.add_argument("--dataset-type", default=None,
                       choices=['cicids2017', 'unsw_nb15', 'auto'],
                       help="Dataset type (auto-detected if not provided)")
    
    args = parser.parse_args()
    
    # Load input data
    print(f"📥 Loading data from {args.input}...")
    df = pd.read_csv(args.input)
    print(f"   Loaded {len(df)} rows, {len(df.columns)} columns")
    
    # Detect dataset type
    if args.dataset_type is None or args.dataset_type == 'auto':
        dataset_type = detect_dataset_type(df)
        print(f"🔍 Auto-detected dataset type: {dataset_type.upper()}")
    else:
        dataset_type = args.dataset_type
        print(f"📋 Using specified dataset type: {dataset_type.upper()}")
    
    # Load model
    print(f"🤖 Loading XGBoost model...")
    model = load_model(args.model_path, dataset_type)
    print(f"   Model loaded successfully")
    
    # Run detection
    print(f"\n🔎 Running intrusion detection...")
    start_time = time.time()
    results = predict_intrusion(df, model, dataset_type)
    detection_time = time.time() - start_time
    
    print(f"   Detection completed in {detection_time:.2f} seconds")
    print(f"   Speed: {len(df)/detection_time:.0f} samples/second")
    
    # Save results
    if args.output:
        results.to_csv(args.output, index=False)
        print(f"\n💾 Results saved to {args.output}")
    
    # Show top threats
    threats = results[results['predicted_label'] == 1].sort_values(
        'attack_probability', ascending=False
    )
    
    if len(threats) > 0:
        print(f"\n⚠️  Top 5 Threats (by confidence):")
        for i, (_, row) in enumerate(threats.head(5).iterrows(), 1):
            print(f"   {i}. {row['attack_type']} - Confidence: {row['attack_probability']*100:.2f}%")
    
    print(f"\n✅ Intrusion detection complete!")


if __name__ == "__main__":
    main()
