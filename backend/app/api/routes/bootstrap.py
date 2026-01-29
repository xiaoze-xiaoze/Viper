from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...db.database import get_db
from ...schemas.bootstrap import BootstrapOut
from ...services.bootstrap_service import build_bootstrap

router = APIRouter()

@router.get("/bootstrap", response_model=BootstrapOut)
def get_bootstrap(db: Session = Depends(get_db)):
    return build_bootstrap(db)
