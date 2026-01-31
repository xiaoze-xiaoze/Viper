import json
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from .api_configs import get_api_config
from .schemas import ChatRequest, ChatResponse
from .sessions import get_session, insert_message, list_messages

router = APIRouter(prefix="/chat", tags=["chat"])

def openai_compatible_chat(base_url: str, chat_completions_path: str, api_key: Optional[str], model: str, extra_headers: Dict[str, Any], messages: List[Dict[str, str]], temperature: float) -> Dict[str, Any]:
    chat_path = chat_completions_path if chat_completions_path.startswith("/") else f"/{chat_completions_path}"
    url = base_url.rstrip("/") + chat_path
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
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

def _openai_compatible_request(base_url: str, chat_completions_path: str, api_key: Optional[str], model: str, extra_headers: Dict[str, Any], messages: List[Dict[str, str]], temperature: float) -> Request:
    chat_path = chat_completions_path if chat_completions_path.startswith("/") else f"/{chat_completions_path}"
    url = base_url.rstrip("/") + chat_path
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
    return Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers=headers, method="POST")

def _openai_compatible_stream(req: Request):
    try:
        return urlopen(req, timeout=120)
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
        chat_completions_path=cfg.get("chat_completions_path") or "/v1/chat/completions",
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

@router.post("/stream")
def chat_stream(payload: ChatRequest):
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

    req = _openai_compatible_request(
        base_url=cfg["base_url"],
        chat_completions_path=cfg.get("chat_completions_path") or "/v1/chat/completions",
        api_key=cfg["api_key"],
        model=cfg["model"],
        extra_headers=cfg["extra_headers"],
        messages=upstream_messages,
        temperature=payload.temperature,
    )
    upstream = _openai_compatible_stream(req)

    assistant_pieces: List[str] = []

    def iterator():
        nonlocal assistant_pieces
        try:
            with upstream as resp:
                while True:
                    raw_line = resp.readline()
                    if not raw_line:
                        break
                    yield raw_line

                    try:
                        line = raw_line.decode("utf-8", errors="ignore").strip()
                    except Exception:
                        continue
                    if not line.startswith("data:"):
                        continue
                    data_str = line.replace("data:", "", 1).strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        event = json.loads(data_str)
                    except Exception:
                        continue
                    choice0 = event.get("choices", [{}])[0] if isinstance(event, dict) else {}
                    delta = choice0.get("delta") if isinstance(choice0, dict) else None
                    piece = delta.get("content") if isinstance(delta, dict) else None
                    if isinstance(piece, str) and piece:
                        assistant_pieces.append(piece)
        finally:
            assistant_content = "".join(assistant_pieces)
            insert_message(payload.session_id, "assistant", assistant_content)

    return StreamingResponse(
        iterator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
