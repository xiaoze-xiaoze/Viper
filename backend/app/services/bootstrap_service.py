import json
from datetime import timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ..db.tables import AppSetting, Chat, ModelConfig


def _iso(dt) -> str:
    if getattr(dt, "tzinfo", None) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _model_row_to_out(row: ModelConfig) -> Dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "apiBaseUrl": row.api_base_url,
        "type": row.type,
        "modelId": row.model_id,
        "apiKey": row.api_key,
        "headers": row.headers,
        "temperature": row.temperature,
        "maxTokens": row.max_tokens,
        "source": row.source,
    }


def _chat_row_to_out(row: Chat) -> Dict[str, Any]:
    return {"id": row.id, "title": row.title, "timestamp": _iso(row.updated_at)}


def _get_setting_json(db: Session, key: str) -> Optional[Dict[str, Any]]:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row or not row.value:
        return None
    try:
        value = json.loads(row.value)
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def build_bootstrap(db: Session) -> Dict[str, Any]:
    models = db.query(ModelConfig).order_by(ModelConfig.updated_at.desc()).all()
    chats = db.query(Chat).order_by(Chat.updated_at.desc()).all()

    selected = _get_setting_json(db, "selectedModelName")
    selected_name = selected.get("name") if selected and isinstance(selected.get("name"), str) else None

    current_chat = _get_setting_json(db, "currentChatId")
    current_chat_id = current_chat.get("id") if current_chat and isinstance(current_chat.get("id"), int) else None
    if current_chat_id is None and chats:
        current_chat_id = chats[0].id

    return {
        "models": [_model_row_to_out(m) for m in models],
        "chats": [_chat_row_to_out(c) for c in chats],
        "selectedModel": selected_name,
        "currentChatId": current_chat_id,
        "messagesByChatId": None,
    }
