from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel

class LlmModelRef(BaseModel):
    id: Optional[int] = None
    name: str
    apiBaseUrl: str
    type: Optional[str] = None
    modelId: Optional[str] = None
    apiKey: Optional[str] = None
    headers: Optional[Union[str, Dict[str, Any]]] = None

class LlmMessage(BaseModel):
    role: str
    content: str

class LlmViperMeta(BaseModel):
    chat_id: int
    assistant_message_id: str
    mode: str

class LlmChatCompletionIn(BaseModel):
    model: LlmModelRef
    messages: List[LlmMessage]
    stream: bool
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    viper: Optional[LlmViperMeta] = None