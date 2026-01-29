from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
import re

from ...schemas.llm import LlmChatCompletionIn
from ...services.llm_proxy import open_chat_completions_stream, request_chat_completions_json

router = APIRouter()

_MODEL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")

@router.post("/llm/chat/completions")
async def llm_chat_completions(payload: LlmChatCompletionIn):
    if not (payload.model.apiBaseUrl or "").strip():
        raise HTTPException(status_code=400, detail="model.apiBaseUrl is required")
    model_id = (payload.model.modelId or "").strip()
    model_name = (payload.model.name or "").strip()
    if not model_id and (not model_name or not _MODEL_ID_RE.match(model_name)):
        raise HTTPException(
            status_code=400,
            detail="model.modelId is required (e.g. deepseek-chat / deepseek-reasoner)",
        )
    if not payload.stream:
        try:
            data = await request_chat_completions_json(payload)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
        return JSONResponse(data)

    try:
        client, resp = await open_chat_completions_stream(payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    if resp.status_code != 200:
        try:
            detail = (await resp.aread()).decode("utf-8", errors="replace")
        except Exception:
            detail = ""
        await resp.aclose()
        await client.aclose()
        raise HTTPException(status_code=resp.status_code, detail=detail or "Upstream error")

    async def gen():
        try:
            async for chunk in resp.aiter_raw():
                if chunk:
                    yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
