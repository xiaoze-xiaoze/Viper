from typing import Optional, Union, Dict, Any
from pydantic import BaseModel

class ModelConfigBase(BaseModel):
    name: str
    apiBaseUrl: str
    type: str = "chat.completions"
    modelId: Optional[str] = None
    apiKey: Optional[str] = None
    headers: Optional[Union[str, Dict[str, Any]]] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None
    source: Optional[str] = None

class ModelConfigIn(ModelConfigBase):
    pass

class ModelConfigPatch(BaseModel):
    name: Optional[str] = None
    apiBaseUrl: Optional[str] = None
    type: Optional[str] = None
    modelId: Optional[str] = None
    apiKey: Optional[str] = None
    headers: Optional[Union[str, Dict[str, Any]]] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None
    source: Optional[str] = None

class ModelConfigOut(ModelConfigBase):
    id: Optional[int] = None

class SelectedModel(BaseModel):
    name: str
    id: Optional[int] = None


class SelectedModelIn(SelectedModel):
    pass
