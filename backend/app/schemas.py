from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]

class ApiConfigCreate(BaseModel):
    name: str
    kind: str = Field(default="openai_compatible")
    base_url: str
    api_key: Optional[str] = None
    model: str
    extra_headers: Dict[str, Any] = Field(default_factory=dict)

class ApiConfigUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    extra_headers: Optional[Dict[str, Any]] = None

class ApiConfigOut(BaseModel):
    id: int
    name: str
    kind: str
    base_url: str
    api_key: Optional[str] = None
    model: str
    extra_headers: Dict[str, Any]
    created_at: str
    updated_at: str

class SessionCreate(BaseModel):
    title: str = Field(default="New Chat")
    api_config_id: Optional[int] = None

class SessionOut(BaseModel):
    id: int
    title: str
    api_config_id: Optional[int] = None
    created_at: str
    updated_at: str

class MessageCreate(BaseModel):
    role: Role
    content: str

class MessageOut(BaseModel):
    id: int
    session_id: int
    role: Role
    content: str
    created_at: str

class SessionWithMessages(BaseModel):
    session: SessionOut
    messages: List[MessageOut]

class ChatRequest(BaseModel):
    session_id: int
    api_config_id: Optional[int] = None
    user_content: str
    system_prompt: Optional[str] = None
    temperature: float = 0.7

class ChatResponse(BaseModel):
    session_id: int
    assistant_content: str
    raw: Dict[str, Any]