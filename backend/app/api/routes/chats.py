from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...db.database import get_db
from ...db.tables import Chat, Message
from ...schemas import ChatCreate, ChatOut, ChatPatch

router = APIRouter()

def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

@router.post("/chats", response_model=ChatOut)
def create_chat(payload: ChatCreate, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(microsecond=0).replace(tzinfo=None)
    row = Chat(title=payload.title, created_at=now, updated_at=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "title": row.title, "timestamp": _iso(row.updated_at)}

@router.patch("/chats/{chatId}", status_code=204)
def patch_chat(chatId: int, payload: ChatPatch, db: Session = Depends(get_db)):
    row = db.query(Chat).filter(Chat.id == chatId).first()
    if not row:
        raise HTTPException(status_code=404, detail="Chat not found")
    if payload.title is not None:
        row.title = payload.title
    row.updated_at = datetime.now(timezone.utc).replace(microsecond=0).replace(tzinfo=None)
    db.commit()

@router.delete("/chats/{chatId}", status_code=204)
def delete_chat(chatId: int, db: Session = Depends(get_db)):
    row = db.query(Chat).filter(Chat.id == chatId).first()
    if not row:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.query(Message).filter(Message.chat_id == chatId).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
