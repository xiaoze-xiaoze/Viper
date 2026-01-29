from typing import Optional
from pydantic import BaseModel

class MessageIn(BaseModel):
    id: str
    role: str
    content: str
    createdAt: str
    status: str
    error: str

class MessageOut(MessageIn):
    pass

class MessagePatch(BaseModel):
    content: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None