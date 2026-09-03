"""
database.py - engine, session factory, declarative Base, settings.

SQLite notes
------------
* ``check_same_thread=False`` is required because FastAPI serves sync
  dependencies from a thread pool, so a session may be touched by a
  different thread than the one that created it.
* WAL + ``busy_timeout`` let concurrent readers coexist with the writer
  instead of failing fast with "database is locked" - the ingestion
  endpoint holds a write transaction for a comparatively long time.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Anchored to this file, not the CWD. The app is launched as
# ``backend.main:app`` from the project root, so a bare ".env" would resolve
# to <root>/.env - which does not exist - and every value here would silently
# fall back to its default (an insecure SECRET_KEY, no GEMINI_API_KEY).
ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

DB_PATH = Path(__file__).resolve().parent.parent / "synapse.db"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = f"sqlite:///{DB_PATH}"

    secret_key: str = "dev-only-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    cors_origins: list[str] = [
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:8000",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:5500",
    ]

    # --- Gemini / ingestion ---
    # Read from GEMINI_API_KEY. Left None, the google-genai SDK resolves its
    # own credentials (GEMINI_API_KEY, then GOOGLE_API_KEY).
    gemini_api_key: str | None = None
    ingestion_model: str = "gemini-3.6-flash"
    max_chunks_per_book: int = 8              # caps cost/latency per upload
    max_upload_bytes: int = 32 * 1024 * 1024  # 32 MB
    llm_concurrency: int = 4                  # parallel chunk requests
    # Gemini's thinking models reason before answering and bill those tokens
    # against the output budget, so cap it rather than leaving it dynamic.
    # 0 disables thinking entirely.
    thinking_budget: int = 2048

    # --- Product rules (mirrors the frontend) ---
    freemium_daily_cap: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
    future=True,
)


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, connection_record) -> None:
    if not _is_sqlite:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=DELETE")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables. Swap for Alembic once the schema starts moving."""
    from . import models  # noqa: F401  (registers mappers before create_all)

    Base.metadata.create_all(bind=engine)


__all__ = [
    "Base",
    "ENV_FILE",
    "SessionLocal",
    "Settings",
    "engine",
    "get_db",
    "get_settings",
    "init_db",
    "settings",
]
