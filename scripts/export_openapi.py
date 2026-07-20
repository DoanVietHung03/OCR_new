import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OCR_DATA_DIR", "./data/jobs")
sys.path.insert(0, str(Path(__file__).parents[1] / "backend"))
from app.main import app  # noqa: E402

target = Path("frontend/openapi.json")
payload = json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
if parser.parse_args().check:
    raise SystemExit(0 if target.exists() and target.read_text(encoding="utf-8") == payload else 1)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(payload, encoding="utf-8")
