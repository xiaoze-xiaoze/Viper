from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api_configs, chat, sessions
from .db import init_db

app = FastAPI(title="Viper Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_configs.router)
app.include_router(sessions.router)
app.include_router(chat.router)
