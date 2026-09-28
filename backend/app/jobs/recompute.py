"""Plain recompute pipeline used by the background job handler."""

import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import LocationPoint, Visit
from app.places.ml import ModelsUnavailable
from app.places.resolve import resolve_visits
from app.stays import Point, detect_stays, filter_points

logger = logging.getLogger(__name__)


def recompute_visits(db: Session, user_id: int) -> dict:
    """Replace one user's visits and return the same counts as the old request path."""
    rows = db.execute(
        select(LocationPoint.ts, LocationPoint.lat, LocationPoint.lon, LocationPoint.accuracy).where(
            LocationPoint.user_id == user_id
        )
    ).all()
    points = [Point(ts=row.ts, lat=row.lat, lon=row.lon, accuracy=row.accuracy) for row in rows]
    kept, dropped = filter_points(points)
    stays = detect_stays(kept)

    db.execute(delete(Visit).where(Visit.user_id == user_id))
    db.add_all(
        Visit(
            user_id=user_id,
            start_ts=stay.start_ts,
            end_ts=stay.end_ts,
            lat=stay.lat,
            lon=stay.lon,
            radius=stay.radius,
            point_count=stay.point_count,
        )
        for stay in stays
    )
    db.flush()
    try:
        resolved = resolve_visits(db, user_id)
    except ModelsUnavailable as error:
        logger.warning("place resolution skipped: %s", error)
        resolved = 0

    return {
        "points": len(points),
        "kept": len(kept),
        "visits": len(stays),
        "resolved": resolved,
        "dropped": dropped,
    }
