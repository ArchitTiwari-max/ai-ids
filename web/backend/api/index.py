import sys
import os
from pathlib import Path

# Add the parent directory to sys.path so 'app' can be imported
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.main import app
