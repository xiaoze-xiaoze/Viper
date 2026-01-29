from typing import Optional
from pydantic import BaseModel

class ChatCreate(BaseModel):
    title: str

class ChatPatch(BaseModel):
    title: Optional[str] = None

class ChatOut(BaseModel):
    id: int
    title: str
    timestamp: str