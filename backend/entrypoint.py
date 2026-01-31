import argparse
import os
import sys
from pathlib import Path

import uvicorn
from backend.app.main import app

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db-path", default=None)
    args = parser.parse_args()

    if args.db_path:
        p = Path(args.db_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        os.environ["VIPER_DB_PATH"] = str(p)

    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

if __name__ == "__main__":
    main()
