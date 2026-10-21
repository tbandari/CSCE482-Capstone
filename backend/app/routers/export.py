import time

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import InterestOverride, LocationPoint, RecommendationFeedback, Visit
from app.schemas import ExportResponse, FeedbackOut, InterestOverrideOut, PointOut, UserOut, VisitOut

router = APIRouter(prefix="/export", tags=["export"])


@router.get("", response_model=ExportResponse)
def export_everything(user: CurrentUser, db: DbSession) -> ExportResponse:
    """One-click full export: every point, visit (with its place), profile edit and saved or dismissed place the account owns, as plain JSON."""
    points = db.scalars(
        select(LocationPoint).where(LocationPoint.user_id == user.id).order_by(LocationPoint.ts.asc())
    ).all()
    visits = db.scalars(
        select(Visit).where(Visit.user_id == user.id).options(selectinload(Visit.place)).order_by(Visit.start_ts.asc())
    ).all()
    overrides = db.scalars(
        select(InterestOverride).where(InterestOverride.user_id == user.id).order_by(InterestOverride.category)
    ).all()
    feedback = db.scalars(
        select(RecommendationFeedback)
        .where(RecommendationFeedback.user_id == user.id)
        .options(selectinload(RecommendationFeedback.place))
        .order_by(RecommendationFeedback.created_at.asc())
    ).all()
    return ExportResponse(
        user=UserOut.model_validate(user),
        exported_at=int(time.time() * 1000),
        points=[PointOut.model_validate(p) for p in points],
        visits=[VisitOut.model_validate(v) for v in visits],
        interest_overrides=[InterestOverrideOut.model_validate(o) for o in overrides],
        recommendation_feedback=[FeedbackOut.model_validate(f) for f in feedback],
    )
