import time

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import LocationPoint, Visit
from app.schemas import ExportResponse, PointOut, UserOut, VisitOut

router = APIRouter(prefix="/export", tags=["export"])


@router.get("", response_model=ExportResponse)
def export_everything(user: CurrentUser, db: DbSession) -> ExportResponse:
    """One-click full export: every point and visit the account owns, as plain JSON."""
    points = db.scalars(
        select(LocationPoint).where(LocationPoint.user_id == user.id).order_by(LocationPoint.ts.asc())
    ).all()
    visits = db.scalars(select(Visit).where(Visit.user_id == user.id).order_by(Visit.start_ts.asc())).all()
    return ExportResponse(
        user=UserOut.model_validate(user),
        exported_at=int(time.time() * 1000),
        points=[PointOut.model_validate(p) for p in points],
        visits=[VisitOut.model_validate(v) for v in visits],
    )
