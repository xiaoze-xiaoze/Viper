import os
import sys
from pathlib import Path


def get_app_data_dir() -> Path:
    override = os.environ.get("VIPER_DATA_DIR", "").strip()
    if override:
        p = Path(override).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
    p = Path(base) / "Viper"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_resource_root() -> Path:
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        return Path(bundle_root).resolve()
    return Path(__file__).resolve().parents[3]


def get_frontend_dist_dir() -> Path:
    root = get_resource_root()
    candidates = [
        root / "frontend" / "dist",
        root / "dist",
        root / "frontend_dist",
    ]
    for p in candidates:
        if (p / "index.html").exists():
            return p
    return candidates[0]
