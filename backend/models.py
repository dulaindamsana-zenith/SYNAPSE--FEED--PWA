"""
models.py - SQLAlchemy ORM models + the SM-2 scheduler.

Field names deliberately mirror the frontend seeds in ``data.js`` so the
API can drop straight into the existing renderers. Camel-case JSON is
produced by the Pydantic schemas in ``main.py``; the DB stays snake_case.

Time convention
---------------
``next_review_date`` / ``last_reviewed`` are **epoch milliseconds**, matching
``Date.now()`` in ``db.js``. Storing ms integers (not DATETIME) keeps the
client-side IndexedDB store and the server byte-identical, so syncing is a
straight copy with no timezone or precision drift.
"""

from __future__ import annotations

import time
import sys
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from backend.database import Base

DAY_MS = 86_400_000

Tier = Literal["guest", "freemium", "pro"]
CardKind = Literal["core", "sandbox", "diagram"]


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    tier: Mapped[str] = mapped_column(String(16), default="freemium", nullable=False)

    # Free-form client state: topics, avatarUrl, onboarding answers, streak…
    profile_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, nullable=False)

    reviews: Mapped[list["CardReview"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    stashes: Mapped[list["Stash"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("tier IN ('guest','freemium','pro')", name="ck_user_tier"),
    )

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p).strip()


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------
class Book(Base):
    __tablename__ = "books"

    # Slug PK, e.g. "atomic-habits" - matches data.js book ids.
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    author: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    topic: Mapped[str] = mapped_column(String(80), index=True, default="", nullable=False)

    cover_color: Mapped[str] = mapped_column(String(16), default="#8B5FBF", nullable=False)
    cover_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    glyph: Mapped[str] = mapped_column(String(8), default="📘", nullable=False)

    minutes: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    related_topics: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    similar_book_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    source: Mapped[str] = mapped_column(String(16), default="seed", nullable=False)  # seed | ingested
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, nullable=False)

    cards: Mapped[list["Flashcard"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="Flashcard.position",
        lazy="selectin",
    )


# ---------------------------------------------------------------------------
# Flashcard
# ---------------------------------------------------------------------------
class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    rule_or_chapter: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    topic: Mapped[str] = mapped_column(String(80), index=True, default="", nullable=False)

    # --- core ---
    zeigarnik_cliffhanger: Mapped[str] = mapped_column(Text, default="", nullable=False)
    unlock_text: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # --- sandbox ---
    # "reflection" | "choice" | "slider" | None
    interactive_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Slider config + a server-validated arithmetic `formula`, or choice tree.
    interactive_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # --- diagram ---
    diagram_svg: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption: Mapped[str] = mapped_column(Text, default="", nullable=False)
    insight: Mapped[str] = mapped_column(Text, default="", nullable=False)

    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    saves: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, nullable=False)

    book: Mapped["Book"] = relationship(back_populates="cards")
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )
    stashes: Mapped[list["Stash"]] = relationship(
        secondary="stash_cards", back_populates="cards", viewonly=True
    )

    __table_args__ = (
        CheckConstraint("kind IN ('core','sandbox','diagram')", name="ck_card_kind"),
        Index("ix_flashcards_book_position", "book_id", "position"),
    )


# ---------------------------------------------------------------------------
# CardReview - one SM-2 record per (user, card)
# ---------------------------------------------------------------------------
class CardReview(Base):
    __tablename__ = "card_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    card_id: Mapped[str] = mapped_column(
        ForeignKey("flashcards.id", ondelete="CASCADE"), index=True, nullable=False
    )

    repetitions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interval: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # days
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    next_review_date: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)  # ms
    last_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_reviewed: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # ms

    user: Mapped["User"] = relationship(back_populates="reviews")

    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_review_user_card"),
        Index("ix_review_user_due", "user_id", "next_review_date"),
    )


# ---------------------------------------------------------------------------
# Stash - a curated collection of cards
# ---------------------------------------------------------------------------
# Public content only. A stash with ``user_id IS NULL`` is one of the curated
# defaults every visitor sees; a stash with a user_id belongs to that account.
# Nothing here is personal data - the client is allowed to cache stashes in
# IndexedDB, which is why ownership is a bare FK and not an embedded profile.
# ---------------------------------------------------------------------------
class StashCard(Base):
    """Association row linking a Stash to a Flashcard."""

    __tablename__ = "stash_cards"

    stash_id: Mapped[str] = mapped_column(
        String(120), ForeignKey("stashes.id", ondelete="CASCADE"), primary_key=True
    )
    card_id: Mapped[str] = mapped_column(
        String(160), ForeignKey("flashcards.id", ondelete="CASCADE"), primary_key=True
    )


class Stash(Base):
    __tablename__ = "stashes"

    # Slug or client-minted id, e.g. "stash-morning" / "cs-1788…".
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    # NULL == a curated public stash, visible to everyone.
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )

    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), default="📚", nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#7b2ff7", nullable=False)

    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, nullable=False)

    # selectin so a stash list endpoint issues two queries, not N+1.
    cards: Mapped[list["Flashcard"]] = relationship(
        secondary="stash_cards",
        back_populates="stashes",
        lazy="selectin",
        order_by="Flashcard.position",
    )
    user: Mapped["User | None"] = relationship(back_populates="stashes")


# ---------------------------------------------------------------------------
# Comment - threaded discussion under a card
# ---------------------------------------------------------------------------
# ``author``/``avatar``/``color`` are denormalised display fields, not a link
# into the user record: a comment must keep rendering after its account is
# deleted (hence ``ondelete="SET NULL"`` on user_id), and the client caches
# comments offline, so nothing identifying beyond a chosen display name may
# live on this row.
# ---------------------------------------------------------------------------
class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    card_id: Mapped[str] = mapped_column(
        String(160), ForeignKey("flashcards.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    author: Mapped[str] = mapped_column(String(100), default="Anonymous", nullable=False)
    avatar: Mapped[str] = mapped_column(String(16), default="?", nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#7b2ff7", nullable=False)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    parent_id: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("comments.id", ondelete="CASCADE"), index=True, nullable=True
    )
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, nullable=False)

    card: Mapped["Flashcard"] = relationship(back_populates="comments")
    replies: Mapped[list["Comment"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="Comment.created_at",
    )
    parent: Mapped["Comment | None"] = relationship(
        back_populates="replies", remote_side="Comment.id"
    )

    __table_args__ = (Index("ix_comments_card_created", "card_id", "created_at"),)


# ---------------------------------------------------------------------------
# SuperMemo SM-2
# ---------------------------------------------------------------------------
# Ported line-for-line from db.js `schedule()` so client and server always
# agree. Any change here MUST be mirrored in db.js or offline reviews will
# diverge from synced ones.
#
#   q >= 3  -> correct: interval ladder 1 -> 6 -> round(I * EF)
#   q <  3  -> lapse:   repetitions reset to 0, interval back to 1 day
#   EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)), floored at 1.3
# ---------------------------------------------------------------------------

# Simplified button set -> SM-2 quality (matches db.js BUTTONS/QUALITY).
QUALITY = {"again": 1, "hard": 2, "good": 4, "easy": 5}


def clamp_quality(q: int | float) -> int:
    """Round and clamp a grade into SM-2's 0..5 band."""
    q = int(round(float(q)))
    return 0 if q < 0 else 5 if q > 5 else q


def sm2_schedule(
    quality: int | float,
    *,
    repetitions: int = 0,
    interval: int = 0,
    ease_factor: float = 2.5,
    now: int | None = None,
) -> dict[str, Any]:
    """Pure SM-2 step. Returns the next scheduling state."""
    q = clamp_quality(quality)

    if q >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1  # relearn tomorrow

    ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ease_factor = max(1.3, round(ease_factor * 100) / 100)

    stamp = now_ms() if now is None else now
    return {
        "repetitions": repetitions,
        "interval": interval,
        "ease_factor": ease_factor,
        "next_review_date": stamp + interval * DAY_MS,
        "last_quality": q,
        "last_reviewed": stamp,
    }


def _state_of(review: CardReview | None) -> dict[str, Any]:
    """Read a review's SM-2 state, coalescing unset columns to SM-2 defaults.

    ``mapped_column(default=...)`` is applied by SQLAlchemy at INSERT, not at
    ``__init__`` - so a newly constructed, not-yet-flushed CardReview has
    ``None`` in every column. Coalescing here keeps the scheduler correct for
    both fresh and persisted rows.
    """
    if review is None:
        return {"repetitions": 0, "interval": 0, "ease_factor": 2.5}
    return {
        "repetitions": review.repetitions if review.repetitions is not None else 0,
        "interval": review.interval if review.interval is not None else 0,
        "ease_factor": review.ease_factor if review.ease_factor is not None else 2.5,
    }


def preview_interval(review: CardReview | None, quality: int | float) -> int:
    """Interval (days) a grade would produce right now - powers the button hints."""
    return sm2_schedule(quality, **_state_of(review))["interval"]


def apply_review(review: CardReview, quality: int | float) -> CardReview:
    """Mutate a CardReview in place with the next SM-2 state."""
    for key, value in sm2_schedule(quality, **_state_of(review)).items():
        setattr(review, key, value)
    return review


__all__ = [
    "DAY_MS",
    "QUALITY",
    "Book",
    "CardKind",
    "CardReview",
    "Comment",
    "Flashcard",
    "Stash",
    "StashCard",
    "Tier",
    "User",
    "apply_review",
    "clamp_quality",
    "now_ms",
    "preview_interval",
    "sm2_schedule",
]
