import json
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from fastapi import APIRouter, HTTPException
from .api_configs import get_api_config
from .schemas import ChatRequest, ChatResponse
from .sessions import get_session, insert_message, list_messages

router = APIRouter(prefix="/chat", tags=["chat"])

def openai_compatible_chat(base_url: str, api_key: Optional[str], model: str, extra_headers: Dict[str, Any], messages: List[Dict[str, str]], temperature: float) -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    for k, v in (extra_headers or {}).items():
        if isinstance(v, str) and v is not None:
            headers[k] = str(v)
    req = Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"upstream http error: {e.code}: {detail}")
    except URLError as e:
        raise HTTPException(status_code=502, detail=f"upstream url error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream error: {str(e)}")

@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> Dict[str, Any]:
    session = get_session(payload.session_id)
    api_config_id = payload.api_config_id
    if api_config_id is None:
        api_config_id = session.get("api_config_id")
    if api_config_id is None:
        raise HTTPException(status_code=400, detail="api_config_id is required (payload or session)")
    cfg = get_api_config(int(api_config_id))
    if cfg["kind"] != "openai_compatible":
        raise HTTPException(status_code=400, detail="unsupported api_config.kind")
    if payload.system_prompt:
        insert_message(payload.session_id, "system", payload.system_prompt)
    insert_message(payload.session_id, "user", payload.user_content)
    history = list_messages(payload.session_id)
    upstream_messages = [{"role": m["role"], "content": m["content"]} for m in history]
    raw = openai_compatible_chat(
        base_url=cfg["base_url"],
        api_key=cfg["api_key"],
        model=cfg["model"],
        extra_headers=cfg["extra_headers"],
        messages=upstream_messages,
        temperature=payload.temperature,
    )
    assistant_content = ""
    try:
        assistant_content = raw["choices"][0]["message"]["content"] or ""
    except Exception:
        assistant_content = json.dumps(raw, ensure_ascii=False)
    insert_message(payload.session_id, "assistant", assistant_content)
    return {"session_id": payload.session_id, "assistant_content": assistant_content, "raw": raw}