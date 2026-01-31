from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from .db import db_session, message_row, session_row, utc_now_iso
from .schemas import MessageCreate, MessageOut, SessionCreate, SessionOut, SessionUpdate, SessionWithMessages

router = APIRouter(prefix="/sessions", tags=["sessions"])

def get_session(session_id: int) -> Dict[str, Any]:
    with db_session() as db:
        row = db.execute("SELECT * FROM chat_sessions WHERE id = ?;", (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")
        return session_row(row)

def touch_session(session_id: int) -> None:
    with db_session() as db:
        db.execute("UPDATE chat_sessions SET updated_at=? WHERE id=?;", (utc_now_iso(), session_id))

def insert_message(session_id: int, role: str, content: str) -> Dict[str, Any]:
    with db_session() as db:
        now = utc_now_iso()
        cur = db.execute(
            "INSERT INTO chat_messages(session_id, role, content, created_at) VALUES(?,?,?,?);",
            (session_id, role, content, now),
        )
        msg_id = cur.lastrowid
        row = db.execute("SELECT * FROM chat_messages WHERE id = ?;", (msg_id,)).fetchone()
    touch_session(session_id)
    return message_row(row)

def list_messages(session_id: int) -> List[Dict[str, Any]]:
    with db_session() as db:
        rows = db.execute(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC;",
            (session_id,),
        ).fetchall()
        return [message_row(r) for r in rows]

@router.post("", response_model=SessionOut)
def create_session(payload: SessionCreate) -> Dict[str, Any]:
    now = utc_now_iso()
    with db_session() as db:
        cur = db.execute(
            "INSERT INTO chat_sessions(title, api_config_id, created_at, updated_at) VALUES(?,?,?,?);",
            (payload.title, payload.api_config_id, now, now),
        )
        session_id = cur.lastrowid
        row = db.execute("SELECT * FROM chat_sessions WHERE id = ?;", (session_id,)).fetchone()
        return session_row(row)

@router.get("", response_model=List[SessionOut])
def list_sessions() -> List[Dict[str, Any]]:
    with db_session() as db:
        rows = db.execute("SELECT * FROM chat_sessions ORDER BY updated_at DESC;").fetchall()
        return [session_row(r) for r in rows]

@router.get("/{session_id}", response_model=SessionWithMessages)
def read_session(session_id: int) -> Dict[str, Any]:
    session = get_session(session_id)
    messages = list_messages(session_id)
    return {"session": session, "messages": messages}

@router.put("/{session_id}", response_model=SessionOut)
def update_session(session_id: int, payload: SessionUpdate) -> Dict[str, Any]:
    existing = get_session(session_id)
    merged = {
        "title": payload.title if payload.title is not None else existing["title"],
        "api_config_id": payload.api_config_id if payload.api_config_id is not None else existing["api_config_id"],
    }
    now = utc_now_iso()
    with db_session() as db:
        db.execute(
            "UPDATE chat_sessions SET title=?, api_config_id=?, updated_at=? WHERE id=?;",
            (merged["title"], merged["api_config_id"], now, session_id),
        )
        row = db.execute("SELECT * FROM chat_sessions WHERE id = ?;", (session_id,)).fetchone()
        return session_row(row)

@router.delete("/{session_id}")
def delete_session(session_id: int) -> Dict[str, Any]:
    get_session(session_id)
    with db_session() as db:
        db.execute("DELETE FROM chat_sessions WHERE id = ?;", (session_id,))
    return {"deleted": session_id}

@router.post("/{session_id}/messages", response_model=MessageOut)
def add_message(session_id: int, payload: MessageCreate) -> Dict[str, Any]:
    get_session(session_id)
    return insert_message(session_id, payload.role, payload.content)
