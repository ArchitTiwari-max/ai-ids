"""
Optimized IDS Model Training - Target 99% Accuracy
Includes: XGBoost, Feature Selection, Hyperparameter Tuning, Ensemble
"""

import argparse
import json
import warnings
from pathlib import Path
from typing import List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.feature_selection import SelectKBest, mutual_info_classif
from sklearn.metrics import classification_report, roc_auc_score, accuracy_score
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer

warnings.filterwarnings('ignore')

# Try to import XGBoost, fallback to sklearn if not available
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("XGBoost not available. Install with: pip install xgboost")

# Try LightGBM
try:
    import lightgbm as lgb
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

from utils.preprocess import infer_column_types


def read_csvs(path: str, nrows: Optional[int] = None) -> pd.DataFrame:
    """Read CSV files from directory or single file"""
    p = Path(path)
    if p.is_dir():
        files = sorted([f for f in p.glob("*.csv")])
        if not files:
            raise FileNotFoundError(f"No CSV files found in {path}")
        dfs: List[pd.DataFrame] = []
        remaining = nrows
        for f in files:
            use_nrows = None
            if remaining is not None:
                if remaining <= 0:
                    break
                use_nrows = remaining
            df = pd.read_csv(f, nrows=use_nrows)
            dfs.append(df)
            if remaining is not None:
                remaining -= len(df)
        df_all = pd.concat(dfs, ignore_index=True)
        return df_all
    elif p.is_file():
        return pd.read_csv(p, nrows=nrows)
    else:
        raise FileNotFoundError(f"Path not found: {path}")


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean data by handling infinity, NaN, and duplicates"""
    # Replace infinity values
    df = df.replace([np.inf, -np.inf], np.nan)
    
    # Drop rows where all values are NaN
    df = df.dropna(how='all')
    
    # Drop duplicate rows
    df = df.drop_duplicates()
    
    return df


def advanced_feature_selection(X: pd.DataFrame, y: pd.Series, 
                              n_features: int = 50) -> Tuple[pd.DataFrame, List[str]]:
    """Select top features using mutual information"""
    # Handle NaN values temporarily for feature selection
    X_temp = X.fillna(X.median())
    
    # SelectKBest with mutual information
    selector = SelectKBest(score_func=mutual_info_classif, k=min(n_features, X.shape[1]))
    X_selected = selector.fit_transform(X_temp, y)
    
    # Get selected feature names
    selected_mask = selector.get_support()
    selected_features = X.columns[selected_mask].tolist()
    
    print(f"Selected {len(selected_features)} features out of {X.shape[1]}")
    return X[selected_features], selected_features


def create_xgboost_model():
    """Create optimized XGBoost classifier"""
    if not XGBOOST_AVAILABLE:
        return None
    
    return xgb.XGBClassifier(
        n_estimators=500,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight='balanced',
        random_state=42,
        n_jobs=-1,
        eval_metric='logloss',
        early_stopping_rounds=50,
        reg_alpha=0.1,
        reg_lambda=1.0,
    )


def create_lightgbm_model():
    """Create optimized LightGBM classifier"""
    if not LIGHTGBM_AVAILABLE:
        return None
    
    return lgb.LGBMClassifier(
        n_estimators=500,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        min_child_samples=20,
    )


def create_ensemble_model(models: dict):
    """Create voting ensemble from multiple models"""
    estimators = []
    
    for name, model in models.items():
        if model is not None:
            estimators.append((name, model))
    
    if len(estimators) == 0:
        raise ValueError("No models available for ensemble")
    
    # Soft voting for better probability estimates
    ensemble = VotingClassifier(
        estimators=estimators,
        voting='soft',
        n_jobs=-1
    )
    
    return ensemble


def build_advanced_preprocessor(numeric_cols: List[str], categorical_cols: List[str]):
    """Build advanced preprocessing pipeline"""
    numeric_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    categorical_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False, max_categories=100))
    ])
    
    preprocessor = ColumnTransformer([
        ('num', numeric_pipeline, numeric_cols),
        ('cat', categorical_pipeline, categorical_cols)
    ], remainder='drop')
    
    return preprocessor


def train_with_validation(X_train, X_val, y_train, y_val, model):
    """Train model with validation set for early stopping"""
    if XGBOOST_AVAILABLE and isinstance(model, xgb.XGBClassifier):
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False
        )
    elif LIGHTGBM_AVAILABLE and isinstance(model, lgb.LGBMClassifier):
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)]
        )
    else:
        model.fit(X_train, y_train)
    
    return model


def evaluate_model(model, X_test, y_test, model_name: str):
    """Comprehensive model evaluation"""
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1] if hasattr(model, 'predict_proba') else None
    
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n{'='*50}")
    print(f"{model_name} Results")
    print(f"{'='*50}")
    print(f"\nAccuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    if y_proba is not None:
        auc = roc_auc_score(y_test, y_proba)
        print(f"ROC-AUC: {auc:.4f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, digits=4))
    
    return accuracy


def main():
    parser = argparse.ArgumentParser(description="Train optimized IDS model")
    parser.add_argument("--data", required=True, help="Path to CSV file or directory")
    parser.add_argument("--label-col", default=None, help="Label column name")
    parser.add_argument("--nrows", type=int, default=None, help="Limit rows")
    parser.add_argument("--test-size", type=float, default=0.15, help="Test set size")
    parser.add_argument("--val-size", type=float, default=0.15, help="Validation set size")
    parser.add_argument("--n-features", type=int, default=50, help="Number of features to select")
    parser.add_argument("--model-out", default="ml/models/model_optimized.joblib")
    parser.add_argument("--use-ensemble", action="store_true", help="Use ensemble of models")
    args = parser.parse_args()

    # Load data
    print("Loading data...")
    df = read_csvs(args.data, nrows=args.nrows)
    print(f"Loaded raw data: {df.shape}")
    
    # Clean data
    df = clean_data(df)
    print(f"After cleaning: {df.shape}")
    
    # Infer labels (using same logic as train.py)
    from train import infer_labels
    X, y, used_label = infer_labels(df, args.label_col)
    print(f"Label column: {used_label}, Attacks: {y.sum()} / {len(y)} ({y.mean()*100:.2f}%)")
    
    # Drop columns with too many NaNs (>50%)
    nan_ratio = X.isna().mean()
    drop_cols = nan_ratio[nan_ratio > 0.5].index.tolist()
    X = X.drop(columns=drop_cols, errors='ignore')
    print(f"Dropped {len(drop_cols)} columns with >50% NaN")
    
    # Infer column types
    numeric_cols, categorical_cols, dropped_cols = infer_column_types(X)
    X = X.drop(columns=dropped_cols, errors='ignore')
    numeric_cols = [c for c in numeric_cols if c in X.columns]
    categorical_cols = [c for c in categorical_cols if c in X.columns]
    print(f"Numeric: {len(numeric_cols)}, Categorical: {len(categorical_cols)}")
    
    # Feature selection (only on numeric features for speed)
    if len(numeric_cols) > args.n_features:
        X_numeric = X[numeric_cols].fillna(X[numeric_cols].median())
        _, selected_num_features = advanced_feature_selection(X_numeric, y, args.n_features)
        numeric_cols = selected_num_features
        print(f"Selected top {len(numeric_cols)} numeric features")
    
    # Final feature set
    X = X[numeric_cols + categorical_cols]
    
    # Split: Train / Val / Test
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42, stratify=y
    )
    val_ratio = args.val_size / (1 - args.test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=val_ratio, random_state=42, stratify=y_temp
    )
    
    print(f"\nSplit sizes:")
    print(f"  Train: {len(X_train)} ({len(X_train)/len(X)*100:.1f}%)")
    print(f"  Val:   {len(X_val)} ({len(X_val)/len(X)*100:.1f}%)")
    print(f"  Test:  {len(X_test)} ({len(X_test)/len(X)*100:.1f}%)")
    
    # Build preprocessor
    preprocessor = build_advanced_preprocessor(numeric_cols, categorical_cols)
    
    # Fit preprocessor and transform data
    print("\nPreprocessing...")
    X_train_processed = preprocessor.fit_transform(X_train)
    X_val_processed = preprocessor.transform(X_val)
    X_test_processed = preprocessor.transform(X_test)
    print(f"Processed shape: {X_train_processed.shape}")
    
    # Train models
    models = {}
    best_accuracy = 0
    best_model = None
    best_name = ""
    
    # XGBoost
    if XGBOOST_AVAILABLE:
        print("\nTraining XGBoost...")
        xgb_model = create_xgboost_model()
        xgb_model = train_with_validation(X_train_processed, X_val_processed, y_train, y_val, xgb_model)
        acc = evaluate_model(xgb_model, X_test_processed, y_test, "XGBoost")
        models['xgb'] = xgb_model
        if acc > best_accuracy:
            best_accuracy = acc
            best_model = xgb_model
            best_name = "XGBoost"
    
    # LightGBM
    if LIGHTGBM_AVAILABLE:
        print("\nTraining LightGBM...")
        lgb_model = create_lightgbm_model()
        lgb_model = train_with_validation(X_train_processed, X_val_processed, y_train, y_val, lgb_model)
        acc = evaluate_model(lgb_model, X_test_processed, y_test, "LightGBM")
        models['lgb'] = lgb_model
        if acc > best_accuracy:
            best_accuracy = acc
            best_model = lgb_model
            best_name = "LightGBM"
    
    # Random Forest (tuned)
    print("\nTraining Random Forest...")
    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    rf_model.fit(X_train_processed, y_train)
    acc = evaluate_model(rf_model, X_test_processed, y_test, "Random Forest")
    models['rf'] = rf_model
    if acc > best_accuracy:
        best_accuracy = acc
        best_model = rf_model
        best_name = "Random Forest"
    
    # Ensemble
    if args.use_ensemble and len(models) > 1:
        print("\nTraining Ensemble...")
        ensemble = create_ensemble_model(models)
        ensemble.fit(X_train_processed, y_train)
        acc = evaluate_model(ensemble, X_test_processed, y_test, "Ensemble")
        if acc > best_accuracy:
            best_accuracy = acc
            best_model = ensemble
            best_name = "Ensemble"
    
    # Save best model
    print(f"\n{'='*50}")
    print(f"Best Model: {best_name} with Accuracy: {best_accuracy:.4f} ({best_accuracy*100:.2f}%)")
    print(f"{'='*50}")
    
    # Save model and preprocessor
    out_path = Path(args.model_out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save both model and preprocessor together
    model_package = {
        'model': best_model,
        'preprocessor': preprocessor,
        'numeric_cols': numeric_cols,
        'categorical_cols': categorical_cols,
        'model_name': best_name,
        'accuracy': best_accuracy
    }
    joblib.dump(model_package, out_path)
    print(f"\nSaved model to {out_path}")
    
    # Save metadata
    metadata = {
        'model_name': best_name,
        'accuracy': float(best_accuracy),
        'roc_auc': float(roc_auc_score(y_test, best_model.predict_proba(X_test_processed)[:, 1])) if hasattr(best_model, 'predict_proba') else None,
        'n_features': len(numeric_cols) + len(categorical_cols),
        'n_samples': len(df),
        'attack_ratio': float(y.mean()),
        'numeric_features': numeric_cols,
        'categorical_features': categorical_cols
    }
    
    metadata_path = out_path.parent / "model_metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to {metadata_path}")


if __name__ == "__main__":
    main()
