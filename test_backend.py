import asyncio
from web.api.index import ingest, PredictRequest
import traceback

req = PredictRequest(features={ "Destination Port": 80, "Flow Duration": 1000, "Total Fwd Packets": 10, "Total Backward Packets": 5 })
try:
    res = asyncio.run(ingest(req))
    print(res)
except Exception as e:
    traceback.print_exc()
