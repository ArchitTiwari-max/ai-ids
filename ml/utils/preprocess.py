from __future__ import annotations
import json
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline


@dataclass
class FeatureSchema:
    numeric_cols: List[str]
    categorical_cols: List[str]
    dropped_cols: List[str]

    def to_json(self) -> str:
        return json.dumps({
            "numeric_cols": self.numeric_cols,
            "categorical_cols": self.categorical_cols,
            "dropped_cols": self.dropped_cols,
        }, indent=2)


def infer_column_types(df: pd.DataFrame, high_cardinality_threshold: int = 1000, id_like_ratio: float = 0.9) -> Tuple[List[str], List[str], List[str]]:
    """
    Infer numeric and categorical columns, and drop likely ID-like or too-high-cardinality columns.
    - Drop columns with > high_cardinality_threshold unique values.
    - Drop columns where unique_count / n_rows > id_like_ratio (likely IDs/timestamps/IPs).
    - Keep remaining object/string columns as categorical; numeric dtypes as numeric.
    """
    n_rows = max(1, len(df))
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    # Object-like candidates
    obj_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    dropped_cols: List[str] = []
    categorical_cols: List[str] = []

    for col in obj_cols:
        nunique = df[col].nunique(dropna=True)
        ratio = nunique / n_rows
        if nunique > high_cardinality_threshold or ratio > id_like_ratio:
            dropped_cols.append(col)
        else:
            categorical_cols.append(col)

    return numeric_cols, categorical_cols, dropped_cols


def build_preprocessor(numeric_cols: List[str], categorical_cols: List[str]) -> ColumnTransformer:
    numeric_pipeline = [
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler(with_mean=True, with_std=True)),
    ]
    # scikit-learn >=1.2 uses 'sparse_output'; older versions used 'sparse'
    try:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)  # sklearn >=1.2
    except TypeError:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse=False)  # sklearn <1.2

    categorical_pipeline = [
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", ohe),
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", Pipeline(numeric_pipeline), numeric_cols),
            ("cat", Pipeline(categorical_pipeline), categorical_cols),
        ],
        remainder="drop",
        sparse_threshold=0.3,
        n_jobs=None,
        verbose_feature_names_out=False,
    )
    return preprocessor


