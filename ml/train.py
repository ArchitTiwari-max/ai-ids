import argparse
import json
import os
from pathlib import Path
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from utils.preprocess import build_preprocessor, infer_column_types, FeatureSchema


def read_csvs(path: str, nrows: Optional[int] = None) -> pd.DataFrame:
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


def infer_labels(df: pd.DataFrame, label_col: Optional[str]) -> tuple[pd.DataFrame, pd.Series, str]:
    candidates = []
    if label_col:
        candidates = [label_col]
    else:
        lower_cols = {c.lower(): c for c in df.columns}
        for key in ["label", "class", "attack_cat", "target"]:
            if key in lower_cols:
                candidates.append(lower_cols[key])

    y = None
    used_label_col = None
    for cand in candidates:
        if cand not in df.columns:
            continue
        if df[cand].dropna().isin([0, 1, "0", "1", True, False, "benign", "malicious", "normal", "attack", "Benign", "Malicious", "Normal", "Attack"]).any():
            # Heuristic mapping
            series = df[cand]
            if series.dtype == object:
                y = series.str.lower().isin(["malicious", "attack", "anomaly"]).astype(int)
            else:
                y = series.astype(float).clip(0, 1).astype(int)
            used_label_col = cand
            break
        if cand.lower() == "attack_cat":
            series = df[cand]
            y = (~series.fillna("Normal").astype(str).str.lower().eq("normal")).astype(int)
            used_label_col = cand
            break

    if y is None:
        # Fallback: if 'Label' exists but not binary – make non-'BENIGN' malicious
        if "Label" in df.columns:
            y = (~df["Label"].fillna("BENIGN").astype(str).str.upper().eq("BENIGN")).astype(int)
            used_label_col = "Label"
        else:
            raise ValueError("Could not infer label column; please specify --label-col")

    X = df.drop(columns=[used_label_col], errors="ignore")
    return X, y, used_label_col


def main():
    parser = argparse.ArgumentParser(description="Train IDS model (RandomForest baseline)")
    parser.add_argument("--data", required=True, help="Path to CSV file or directory of CSVs")
    parser.add_argument("--label-col", default=None, help="Optional label column name")
    parser.add_argument("--nrows", type=int, default=None, help="Limit rows for faster training")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--model-out", default="ml/models/model.joblib")
    parser.add_argument("--schema-out", default="ml/models/schema.json")
    args = parser.parse_args()

    df = read_csvs(args.data, nrows=args.nrows)
    print(f"Loaded data shape: {df.shape}")

    X, y, used_label = infer_labels(df, args.label_col)
    print(f"Using label column: {used_label}; positive=malicious (1)")

    # Infer feature types and drop problematic columns
    numeric_cols, categorical_cols, dropped_cols = infer_column_types(X)
    X = X.drop(columns=dropped_cols, errors="ignore")
    numeric_cols = [c for c in numeric_cols if c in X.columns]
    categorical_cols = [c for c in categorical_cols if c in X.columns]

    preprocessor = build_preprocessor(numeric_cols, categorical_cols)

    clf = RandomForestClassifier(
        n_estimators=200,
        n_jobs=-1,
        class_weight="balanced",
        random_state=args.random_state,
    )

    pipe = Pipeline(steps=[
        ("pre", preprocessor),
        ("clf", clf),
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.random_state, stratify=y
    )

    pipe.fit(X_train, y_train)

    y_pred = pipe.predict(X_test)
    print("\nClassification report (test):\n")
    print(classification_report(y_test, y_pred, digits=4))

    if hasattr(pipe, "predict_proba"):
        try:
            y_proba = pipe.predict_proba(X_test)[:, 1]
            auc = roc_auc_score(y_test, y_proba)
            print(f"ROC-AUC: {auc:.4f}")
        except Exception:
            pass

    out_path = Path(args.model_out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipe, out_path)
    print(f"Saved model to {out_path}")

    schema = FeatureSchema(numeric_cols=numeric_cols, categorical_cols=categorical_cols, dropped_cols=dropped_cols)
    schema_path = Path(args.schema_out)
    schema_path.parent.mkdir(parents=True, exist_ok=True)
    schema_path.write_text(schema.to_json())
    print(f"Saved schema to {schema_path}")


if __name__ == "__main__":
    main()
