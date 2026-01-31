import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

DB_PATH = Path(__file__).resolve().parent.parent / "viper.sqlite3"

def utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@contextmanager
def db_session() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db() -> None:
    with db_session() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS api_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT '',
                base_url TEXT NOT NULL,
                api_key TEXT,
                model TEXT NOT NULL,
                chat_completions_path TEXT NOT NULL DEFAULT '/v1/chat/completions',
                extra_headers_json TEXT NOT NULL DEFAULT '{}',
                temperature REAL NOT NULL DEFAULT 0.7,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                api_config_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(api_config_id) REFERENCES api_configs(id) ON DELETE SET NULL
            );
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);")
        try:
            cols = {r["name"] for r in db.execute("PRAGMA table_info(api_configs);").fetchall()}
            if "update_at" in cols and "updated_at" not in cols:
                db.execute("ALTER TABLE api_configs RENAME COLUMN update_at TO updated_at;")
            if "provider" not in cols:
                db.execute("ALTER TABLE api_configs ADD COLUMN provider TEXT NOT NULL DEFAULT '';")
            if "chat_completions_path" not in cols:
                db.execute(
                    "ALTER TABLE api_configs ADD COLUMN chat_completions_path TEXT NOT NULL DEFAULT '/v1/chat/completions';"
                )
            if "temperature" not in cols:
                db.execute("ALTER TABLE api_configs ADD COLUMN temperature REAL NOT NULL DEFAULT 0.7;")
        except Exception:
            pass

def dumps_json_obj(value: Optional[Dict[str, Any]]) -> str:
    return json.dumps(value or {}, ensure_ascii=False, separators=(",", ":"))

def loads_json_obj(value: Optional[str]) -> Dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def api_config_row(row: sqlite3.Row) -> Dict[str, Any]:
    keys = set(row.keys())
    updated_at = row["updated_at"] if "updated_at" in keys else (row["update_at"] if "update_at" in keys else None)
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "provider": row["provider"] if "provider" in keys else "",
        "base_url": row["base_url"],
        "api_key": row["api_key"],
        "model": row["model"],
        "chat_completions_path": row["chat_completions_path"] if "chat_completions_path" in keys else "/v1/chat/completions",
        "extra_headers": loads_json_obj(row["extra_headers_json"] if "extra_headers_json" in keys else None),
        "temperature": float(row["temperature"]) if "temperature" in keys and row["temperature"] is not None else 0.7,
        "created_at": row["created_at"],
        "updated_at": updated_at,
    }

def session_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "api_config_id": row["api_config_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

def message_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "role": row["role"],
        "content": row["content"],
        "created_at": row["created_at"],
    }
