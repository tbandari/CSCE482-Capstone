"""
Schema. Coordinates are plain columns; the PostGIS geography column and GiST
index arrive with the Alembic migration (month 2, part 2). Everything a user owns
hangs off `users` with ON DELETE CASCADE so account deletion is one statement.
`places` is the shared OpenStreetMap index and belongs to nobody.
"""

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# SQLite only auto-increments INTEGER primary keys.
BigId = BigInteger().with_variant(Integer, "sqlite")


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    points: Mapped[list["LocationPoint"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    visits: Mapped[list["Visit"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    interest_overrides: Mapped[list["InterestOverride"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class LocationPoint(Base):
    __tablename__ = "location_points"
    __table_args__ = (
        UniqueConstraint("user_id", "ts", "lat", "lon", name="uq_location_point"),
        Index("ix_location_points_user_ts", "user_id", "ts"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ts: Mapped[int] = mapped_column(BigInteger)  # epoch milliseconds, UTC
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(16))  # device | import
    import_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    user: Mapped[User] = relationship(back_populates="points")


class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (Index("ix_visits_user_start", "user_id", "start_ts"),)

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    start_ts: Mapped[int] = mapped_column(BigInteger)
    end_ts: Mapped[int] = mapped_column(BigInteger)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    radius: Mapped[float] = mapped_column(Float)
    point_count: Mapped[int] = mapped_column(Integer)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    place_id: Mapped[int | None] = mapped_column(
        ForeignKey("places.id", ondelete="SET NULL"), nullable=True, index=True
    )
    place_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    user: Mapped[User] = relationship(back_populates="visits")
    place: Mapped["Place | None"] = relationship()


class Place(Base):
    """One named OpenStreetMap feature. Loaded by scripts/load_osm.py, never from user data."""

    __tablename__ = "places"
    __table_args__ = (Index("ix_places_lat_lon", "lat", "lon"),)

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    osm_id: Mapped[str] = mapped_column(String(32), unique=True)  # "node/123", "way/456"
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(String(32), index=True)  # one of app.ml.types.CATEGORIES
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    opening_hours: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)


class InterestOverride(Base):
    """A user's edit to their interest profile. Only `hidden` for now."""

    __tablename__ = "interest_overrides"
    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_interest_override"),)

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="interest_overrides")
