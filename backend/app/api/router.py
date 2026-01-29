from fastapi import APIRouter
from .routes import bootstrap
from .routes import models
from .routes import chats
from .routes import messages
from .routes import llm

router = APIRouter()
router.include_router(bootstrap.router, prefix="/api")
router.include_router(models.router, prefix="/api")
router.include_router(chats.router, prefix="/api")
router.include_router(messages.router, prefix="/api")
router.include_router(llm.router, prefix="/api")