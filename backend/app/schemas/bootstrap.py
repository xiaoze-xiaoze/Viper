from typing import List, Optional, Dict
from pydantic import BaseModel
from .model_config import ModelConfigOut
from .chat import ChatOut
from .message import MessageOut

class BootstrapOut(BaseModel):
    models: List[ModelConfigOut]
    chats: List[ChatOut]
    selectedModel: Optional[str] = None
    currentChatId: Optional[int] = None
    messagesByChatId: Optional[Dict[str, List[MessageOut]]] = None