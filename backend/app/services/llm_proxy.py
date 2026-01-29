import json
from typing import Any, Dict, Optional, Tuple, Union

import httpx

from ..schemas.llm import LlmChatCompletionIn


def merge_headers(model_headers: Optional[Union[str, Dict[str, Any]]], api_key: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if isinstance(model_headers, str):
        try:
            parsed = json.loads(model_headers)
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if k is None or v is None:
                        continue
                    out[str(k)] = str(v)
        except Exception:
            pass
    elif isinstance(model_headers, dict):
        for k, v in model_headers.items():
            if k is None or v is None:
                continue
            out[str(k)] = str(v)

    if api_key:
        out["Authorization"] = f"Bearer {api_key}"

    out.setdefault("Content-Type", "application/json")
    out.setdefault("Accept", "text/event-stream")
    return out


def build_chat_completions_url(api_base_url: str) -> str:
    upstream = (api_base_url or "").rstrip("/")
    return f"{upstream}/v1/chat/completions"


def build_chat_completions_body(payload: LlmChatCompletionIn) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "model": payload.model.modelId or payload.model.name,
        "messages": [{"role": m.role, "content": m.content} for m in payload.messages],
        "stream": bool(payload.stream),
    }
    if payload.temperature is not None:
        body["temperature"] = payload.temperature
    if payload.max_tokens is not None:
        body["max_tokens"] = payload.max_tokens
    return body


async def open_chat_completions_stream(payload: LlmChatCompletionIn) -> Tuple[httpx.AsyncClient, httpx.Response]:
    url = build_chat_completions_url(payload.model.apiBaseUrl)
    headers = merge_headers(payload.model.headers, payload.model.apiKey or "")
    body = build_chat_completions_body(payload)

    timeout = httpx.Timeout(connect=60.0, write=60.0, read=None, pool=60.0)
    client = httpx.AsyncClient(timeout=timeout)
    request = client.build_request("POST", url, headers=headers, json=body)
    response = await client.send(request, stream=True)
    return client, response


async def request_chat_completions_json(payload: LlmChatCompletionIn) -> Dict[str, Any]:
    url = build_chat_completions_url(payload.model.apiBaseUrl)
    headers = merge_headers(payload.model.headers, payload.model.apiKey or "")
    body = build_chat_completions_body(payload)
    body["stream"] = False

    timeout = httpx.Timeout(connect=60.0, write=60.0, read=60.0, pool=60.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        return resp.json()
