import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...db.database import get_db
from ...db.tables import ModelConfig, AppSetting
from ...schemas import ModelConfigIn, ModelConfigOut, ModelConfigPatch, SelectedModelIn

router = APIRouter()

def _now_dt():
    return datetime.now(timezone.utc).replace(microsecond=0).replace(tzinfo=None)

def _to_model_out(row: ModelConfig) -> Dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "apiBaseUrl": row.api_base_url,
        "type": row.type,
        "modelId": row.model_id,
        "apiKey": row.api_key,
        "headers": row.headers,
        "temperature": row.temperature,
        "maxTokens": row.max_tokens,
        "source": row.source,
    }

@router.post("/models", response_model=ModelConfigOut)
def create_model(payload: ModelConfigIn, db: Session = Depends(get_db)):
    headers = payload.headers
    if isinstance(headers, dict):
        headers = json.dumps(headers)
    created_at = _now_dt()
    row =  ModelConfig(
        name=payload.name,
        api_base_url=payload.apiBaseUrl,
        type=payload.type,
        model_id=payload.modelId,
        api_key=payload.apiKey,
        headers=headers,
        temperature=payload.temperature,
        max_tokens=payload.maxTokens,
        source=payload.source or "custom",
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_model_out(row)

@router.patch("/models/{id}", response_model=ModelConfigOut)
def patch_model_by_id(id: int, payload: ModelConfigPatch, db: Session = Depends(get_db)):
    row = db.query(ModelConfig).filter(ModelConfig.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="model not found")
    if payload.name is not None:
        row.name = payload.name
    if payload.apiBaseUrl is not None:
        row.api_base_url = payload.apiBaseUrl
    if payload.type is not None:
        row.type = payload.type
    if payload.modelId is not None:
        row.model_id = payload.modelId
    if payload.apiKey is not None:
        row.api_key = payload.apiKey
    if payload.headers is not None:
        headers = payload.headers
        if isinstance(headers, dict):
            headers = json.dumps(headers, ensure_ascii=False)
        row.headers = headers
    if payload.temperature is not None:
        row.temperature = payload.temperature
    if payload.maxTokens is not None:
        row.max_tokens = payload.maxTokens
    if payload.source is not None:
        row.source = payload.source
    row.updated_at = _now_dt()
    db.commit()
    db.refresh(row)
    return _to_model_out(row)

@router.patch("/models/by-name/{name}", response_model=ModelConfigOut)
def patch_model_by_name(name: str, payload: ModelConfigPatch, db: Session = Depends(get_db)):
    row = db.query(ModelConfig).filter(ModelConfig.name == name).first()
    if not row:
        raise HTTPException(status_code=404, detail="model not found")
    if payload.name is not None:
        row.name = payload.name
    if payload.apiBaseUrl is not None:
        row.api_base_url = payload.apiBaseUrl
    if payload.type is not None:
        row.type = payload.type
    if payload.modelId is not None:
        row.model_id = payload.modelId
    if payload.apiKey is not None:
        row.api_key = payload.apiKey
    if payload.headers is not None:
        headers = payload.headers
        if isinstance(headers, dict):
            headers = json.dumps(headers, ensure_ascii=False)
        row.headers = headers
    if payload.temperature is not None:
        row.temperature = payload.temperature
    if payload.maxTokens is not None:
        row.max_tokens = payload.maxTokens
    if payload.source is not None:
        row.source = payload.source
    row.updated_at = _now_dt()
    db.commit()
    db.refresh(row)
    return _to_model_out(row)

@router.delete("/models/{id}", status_code=204)
def delete_model_by_id(id: int, db: Session = Depends(get_db)):
    row = db.query(ModelConfig).filter(ModelConfig.id == id).first()
    if not row:
        return
    db.delete(row)
    db.commit()

@router.delete("/models/by-name/{name}", status_code=204)
def delete_model_by_name(name: str, db: Session = Depends(get_db)):
    row = db.query(ModelConfig).filter(ModelConfig.name == name).first()
    if not row:
        return
    db.delete(row)
    db.commit()

@router.put("/models/selected", status_code=204)
def put_selected_model(payload: SelectedModelIn, db: Session = Depends(get_db)):
    kv = db.query(AppSetting).filter(AppSetting.key == "selectedModelName").first()
    value = json.dumps({"name": payload.name, "id": payload.id}, ensure_ascii=False)
    if kv:
        kv.value = value
    else:
        kv = AppSetting(key="selectedModelName", value=value)
        db.add(kv)
    db.commit()
