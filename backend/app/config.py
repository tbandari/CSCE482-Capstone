from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be set with an ORBIT_* environment variable."""

    model_config = SettingsConfigDict(env_prefix="ORBIT_", env_file=".env", extra="ignore")

    # SQLite keeps local development dependency-free; production uses PostgreSQL + PostGIS
    # via docker-compose (postgresql+psycopg://orbit:orbit@localhost:5432/orbit).
    database_url: str = "sqlite:///./orbit-dev.db"
    jwt_secret: str = "dev-only-secret-change-me-before-any-deployment-0123456789"
    jwt_ttl_seconds: int = 60 * 60 * 24 * 30
    max_batch_size: int = 5000
    cors_origins: list[str] = ["*"]

    # Place resolution: candidates within this radius of a visit's centroid are ranked,
    # and the best one is assigned only if its confidence clears the threshold.
    place_search_radius_m: float = 50
    place_min_confidence: float = 0.35
    # Opening hours are local time; one zone is enough until users travel (Part 2: per-visit zone).
    place_timezone: str = "America/Chicago"


settings = Settings()
