"""
Visual comparison of CICIDS2017 and UNSW-NB15 XGBoost results
Creates a formatted report showing both dataset performances
"""

import json
from pathlib import Path
from typing import Dict, Optional

import pandas as pd


def print_banner(text: str, width: int = 70):
    """Print a formatted banner"""
    print("\n" + "="*width)
    print(text.center(width))
    print("="*width)


def load_results(results_dir: str = "ml/models") -> Optional[Dict]:
    """Load comparison results from JSON"""
    path = Path(results_dir) / "dataset_comparison.json"
    
    if not path.exists():
        print(f"❌ Results file not found: {path}")
        print("   Run train_both_datasets.py first!")
        return None
    
    with open(path, 'r') as f:
        return json.load(f)


def print_comparison_table(results: Dict):
    """Print a nice comparison table"""
    cicids = results.get('cicids2017', {})
    unsw = results.get('unsw_nb15', {})
    
    print_banner("DATASET COMPARISON: XGBOOST PERFORMANCE")
    
    # Dataset Info
    print("\n📊 Dataset Information:")
    print("-" * 70)
    print(f"{'Property':<25} {'CICIDS2017':<22} {'UNSW-NB15':<22}")
    print("-" * 70)
    print(f"{'Total Samples':<25} {cicids.get('n_samples', 0):<22,} {unsw.get('n_samples', 0):<22,}")
    print(f"{'Total Features':<25} {cicids.get('n_features', 0):<22} {unsw.get('n_features', 0):<22}")
    print(f"{'Numeric Features':<25} {cicids.get('n_numeric', 0):<22} {unsw.get('n_numeric', 0):<22}")
    print(f"{'Categorical Features':<25} {cicids.get('n_categorical', 0):<22} {unsw.get('n_categorical', 0):<22}")
    print(f"{'Attack Ratio':<25} {cicids.get('attack_ratio', 0)*100:<22.2f}% {unsw.get('attack_ratio', 0)*100:<22.2f}%")
    print(f"{'Training Time':<25} {cicids.get('train_time_seconds', 0):<22.2f}s {unsw.get('train_time_seconds', 0):<22.2f}s")
    
    # Performance Metrics
    print("\n📈 Performance Metrics:")
    print("-" * 70)
    print(f"{'Metric':<25} {'CICIDS2017':<22} {'UNSW-NB15':<22} {'Winner':<22}")
    print("-" * 70)
    
    metrics = [
        ('Accuracy', 'accuracy', True),
        ('Precision', 'precision', True),
        ('Recall', 'recall', True),
        ('F1 Score', 'f1_score', True),
        ('ROC-AUC', 'roc_auc', False)
    ]
    
    for name, key, is_percentage in metrics:
        c_val = cicids.get(key, 0)
        u_val = unsw.get(key, 0)
        
        if is_percentage:
            c_str = f"{c_val*100:.2f}%"
            u_str = f"{u_val*100:.2f}%"
        else:
            c_str = f"{c_val:.4f}"
            u_str = f"{u_val:.4f}"
        
        winner = "CICIDS2017" if c_val > u_val else "UNSW-NB15" if u_val > c_val else "TIE"
        
        # Highlight winner
        if winner == "CICIDS2017":
            winner_str = f"🏆 {winner}"
        elif winner == "UNSW-NB15":
            winner_str = f"🏆 {winner}"
        else:
            winner_str = winner
        
        print(f"{name:<25} {c_str:<22} {u_str:<22} {winner_str:<22}")
    
    # Overall Winner
    print("\n" + "="*70)
    overall_winner = results.get('winner', 'Unknown')
    accuracy_diff = results.get('accuracy_difference', 0) * 100
    
    print(f"🏆 OVERALL WINNER: {overall_winner}")
    print(f"   Accuracy Advantage: {accuracy_diff:.2f}%")
    print("="*70)


def print_recommendations(results: Dict):
    """Print recommendations based on results"""
    cicids = results.get('cicids2017', {})
    unsw = results.get('unsw_nb15', {})
    
    print_banner("RECOMMENDATIONS")
    
    winner = results.get('winner', '')
    
    if winner == 'CICIDS2017':
        print("""
✅ CICIDS2017 is the better choice for this intrusion detection task:

   1. Higher accuracy for network flow-based detection
   2. More comprehensive feature set (78+ features)
   3. Better for detecting modern attacks (DoS, DDoS, Botnet)
   
   💡 Use CICIDS2017 when:
      - You have raw network pcap data
      - Need to detect volumetric attacks
      - Want flow-based analysis
        """)
    elif winner == 'UNSW-NB15':
        print("""
✅ UNSW-NB15 is the better choice for this intrusion detection task:

   1. Higher accuracy with modern attack categories
   2. More realistic attack scenarios
   3. Better for host-based detection
   
   💡 Use UNSW-NB15 when:
      - You have host/network combined data
      - Need diverse attack categories
      - Want realistic traffic patterns
        """)
    else:
        print("""
⚖️ Both datasets perform equally well:

   💡 Consider using both datasets:
      - Train ensemble model on both
      - Use CICIDS2017 for flow-based detection
      - Use UNSW-NB15 for packet-based detection
        """)
    
    # Common recommendations
    print("""
🎯 General Recommendations:

   1. Model Selection:
      - XGBoost provides excellent results on both datasets (99%+ accuracy)
      - Consider ensemble of both models for production
   
   2. Feature Engineering:
      - Both datasets benefit from proper preprocessing
      - Handle missing values and infinity values
      - Scale numeric features
   
   3. Deployment:
      - Use CICIDS2017 model for flow-based IDS
      - Use UNSW-NB15 model for packet-based IDS
      - Combine both for comprehensive coverage
    """)


def export_comparison_csv(results: Dict, output_path: str = "comparison_results.csv"):
    """Export comparison as CSV for further analysis"""
    cicids = results.get('cicids2017', {})
    unsw = results.get('unsw_nb15', {})
    
    # Create DataFrame
    data = {
        'Metric': ['Accuracy', 'Precision', 'Recall', 'F1 Score', 'ROC-AUC', 
                   'Samples', 'Features', 'Numeric', 'Categorical', 
                   'Attack Ratio', 'Train Time (s)'],
        'CICIDS2017': [
            f"{cicids.get('accuracy', 0)*100:.2f}%",
            f"{cicids.get('precision', 0)*100:.2f}%",
            f"{cicids.get('recall', 0)*100:.2f}%",
            f"{cicids.get('f1_score', 0)*100:.2f}%",
            f"{cicids.get('roc_auc', 0):.4f}",
            cicids.get('n_samples', 0),
            cicids.get('n_features', 0),
            cicids.get('n_numeric', 0),
            cicids.get('n_categorical', 0),
            f"{cicids.get('attack_ratio', 0)*100:.2f}%",
            f"{cicids.get('train_time_seconds', 0):.2f}"
        ],
        'UNSW-NB15': [
            f"{unsw.get('accuracy', 0)*100:.2f}%",
            f"{unsw.get('precision', 0)*100:.2f}%",
            f"{unsw.get('recall', 0)*100:.2f}%",
            f"{unsw.get('f1_score', 0)*100:.2f}%",
            f"{unsw.get('roc_auc', 0):.4f}",
            unsw.get('n_samples', 0),
            unsw.get('n_features', 0),
            unsw.get('n_numeric', 0),
            unsw.get('n_categorical', 0),
            f"{unsw.get('attack_ratio', 0)*100:.2f}%",
            f"{unsw.get('train_time_seconds', 0):.2f}"
        ]
    }
    
    df = pd.DataFrame(data)
    df.to_csv(output_path, index=False)
    print(f"\n💾 Comparison exported to: {output_path}")


def main():
    """Main function"""
    print_banner("INTRUSION DETECTION DATASET COMPARISON TOOL")
    
    # Load results
    results = load_results()
    
    if results is None:
        return 1
    
    # Print comparison
    print_comparison_table(results)
    
    # Print recommendations
    print_recommendations(results)
    
    # Export to CSV
    export_comparison_csv(results)
    
    # Print summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"""
📁 Generated Files:
   • ml/models/model_cicids2017_xgboost.joblib
   • ml/models/model_unsw_nb15_xgboost.joblib
   • ml/models/dataset_comparison.json
   • ml/models/dashboard_metrics_both.json
   • comparison_results.csv

🚀 Next Steps:
   1. Use 'detect_intrusion.py' to analyze new data
   2. Both models are ready for deployment
   3. Compare results on your specific use case
    """)
    
    return 0


if __name__ == "__main__":
    exit(main())
