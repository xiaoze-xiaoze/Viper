from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...db.database import get_db
from ...db.tables import Message
from ...schemas.message import MessageIn, MessageOut, MessagePatch

router = APIRouter()

def _to_out(row: Message) -> Dict[str, Any]:
    dt = row.created_at
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    created = dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "id": str(row.id),
        "role": row.role,
        "content": row.content,
        "createdAt": created,
        "status": row.status,
        "error": row.error or "",
    }

def _parse_iso(s: str) -> datetime:
    if s.endswith("Z"):
        s = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)

@router.get("/chats/{chatId}/messages", response_model=List[MessageOut])
def list_messages(chatId: int, db: Session = Depends(get_db)):
    rows = db.query(Message).filter(Message.chat_id == chatId).order_by(Message.created_at.asc()).all()
    return [_to_out(r) for r in rows]

@router.post("/chats/{chatId}/messages", status_code=204)
def create_message(chatId: int, payload: MessageIn, db: Session = Depends(get_db)):
    created_at = _parse_iso(payload.createdAt)
    row = Message(
        id=payload.id,
        chat_id=chatId,
        role=payload.role,
        content=payload.content,
        created_at=created_at,
        status=payload.status,
        error=payload.error or "",
    )
    db.add(row)
    db.commit()

@router.patch("/chats/{chatId}/messages/{messageId}", status_code=204)
def patch_message(chatId: int, messageId: str, payload: MessagePatch, db: Session = Depends(get_db)):
    row = db.query(Message).filter(Message.chat_id == chatId, Message.id == messageId).first()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")    
    if payload.content is not None:
        row.content = payload.content
    if payload.status is not None:
        row.status = payload.status
    if payload.error is not None:
        row.error = payload.error
    db.commit()
