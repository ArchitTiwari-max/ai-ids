import argparse
import time
import json
from pathlib import Path

import pandas as pd
import requests


def main():
    parser = argparse.ArgumentParser(description="Replay CSV rows to backend /ingest at a fixed rate")
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    parser.add_argument("--url", default="http://localhost:8000/ingest", help="Backend ingest URL")
    parser.add_argument("--rate", type=float, default=20.0, help="Rows per second")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit of rows to send")
    args = parser.parse_args()

    df = pd.read_csv(Path(args.csv))
    sleep_s = 1.0 / max(args.rate, 0.1)

    sent = 0
    for _, row in df.iterrows():
        features = row.dropna().to_dict()
        try:
            resp = requests.post(args.url, json={"features": features}, timeout=5)
            if resp.status_code != 200:
                print(f"[WARN] HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[WARN] Request failed: {e}")
        sent += 1
        if args.limit and sent >= args.limit:
            break
        time.sleep(sleep_s)

    print(f"Done. Sent {sent} rows -> {args.url}")


if __name__ == "__main__":
    main()
