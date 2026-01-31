from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from .db import api_config_row, db_session, dumps_json_obj, utc_now_iso
from .schemas import ApiConfigCreate, ApiConfigUpdate, ApiConfigOut

router = APIRouter(prefix="/api-configs", tags=["api-configs"])

def get_api_config(api_config_id: int) -> Dict[str, Any]:
    with db_session() as db:
        row = db.execute("SELECT * FROM api_configs WHERE id = ?;", (api_config_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="API config not found")
        return api_config_row(row)

@router.post("", response_model=ApiConfigOut)
def create_api_config(payload: ApiConfigCreate) -> Dict[str, Any]:
    now = utc_now_iso()
    base_url = payload.base_url.rstrip("/")
    with db_session() as db:
        cur = db.execute(
            """
            INSERT INTO api_configs(name, kind, base_url, api_key, model, extra_headers_json, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?);
            """,
            (
                payload.name,
                payload.kind,
                base_url,
                payload.api_key,
                payload.model,
                dumps_json_obj(payload.extra_headers),
                now,
                now,
            ),
        )
        new_id = cur.lastrowid
        row = db.execute("SELECT * FROM api_configs WHERE id = ?;", (new_id,)).fetchone()
        return api_config_row(row) 

@router.get("", response_model=List[ApiConfigOut])
def list_api_configs() -> List[Dict[str, Any]]:
    with db_session() as db:
        rows = db.execute("SELECT * FROM api_configs ORDER BY id DESC;").fetchall()
        return [api_config_row(r) for r in rows]

@router.get("/{api_config_id}", response_model=ApiConfigOut)
def read_api_config(api_config_id: int) -> Dict[str, Any]:
    return get_api_config(api_config_id)

@router.put("/{api_config_id}", response_model=ApiConfigOut)
def update_api_config(api_config_id: int, payload: ApiConfigUpdate) -> Dict[str, Any]:
    existing = get_api_config(api_config_id)
    merged = {
        "name": payload.name if payload.name is not None else existing["name"],
        "kind": payload.kind if payload.kind is not None else existing["kind"],
        "base_url": (payload.base_url.rstrip("/") if payload.base_url is not None else existing["base_url"]),
        "api_key": payload.api_key if payload.api_key is not None else existing["api_key"],
        "model": payload.model if payload.model is not None else existing["model"],
        "extra_headers": payload.extra_headers if payload.extra_headers is not None else existing["extra_headers"],
    }
    now = utc_now_iso()
    with db_session() as db:
        db.execute(
            """
            UPDATE api_configs
            SET name=?, kind=?, base_url=?, api_key=?, model=?, extra_headers_json=?, updated_at=?
            WHERE id=?;
            """,
            (
                merged["name"],
                merged["kind"],
                merged["base_url"],
                merged["api_key"],
                merged["model"],
                dumps_json_obj(merged["extra_headers"]),
                now,
                api_config_id,
            ),
        )
        row = db.execute("SELECT * FROM api_configs WHERE id = ?;", (api_config_id,)).fetchone()
        return api_config_row(row)

@router.delete("/{api_config_id}")
def delete_api_config(api_config_id: int) -> Dict[str, Any]:
    get_api_config(api_config_id)
    with db_session() as db:
        db.execute("DELETE FROM api_configs WHERE id = ?;", (api_config_id,))
    return {"deleted": api_config_id}
