"""
main.py - FastAPI app: auth, ingestion, feed, books, SM-2 review sync.

Run (from the project root, one level above ``backend/``)::

    uvicorn backend.main:app --reload --port 8001

JSON is camelCase on the wire to match the existing frontend renderers;
the database stays snake_case.
"""

from __future__ import annotations

import logging
import os
import random
import secrets
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import sys
from pathlib import Path

_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from backend import ai_ingestion
from backend.database import SessionLocal, get_db, init_db, settings
from backend.models import (
    Book,
    CardReview,
    Comment,
    Flashcard,
    Stash,
    StashCard,
    User,
    apply_review,
    clamp_quality,
    now_ms,
    preview_interval,
    sm2_schedule,
)
from backend.seed import seed_database_if_empty

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("synapse")


# ---------------------------------------------------------------------------
# Auth primitives
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

# bcrypt hashes at most 72 bytes and silently ignores the rest - a longer
# password would authenticate against its own 72-byte prefix.
BCRYPT_MAX_BYTES = 72


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise CREDENTIALS_ERROR
    try:
        payload = jwt.decode(
            credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None:
        raise CREDENTIALS_ERROR
    return user


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """Guest-tolerant auth - the feed is browsable signed out."""
    if credentials is None:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
DbSession = Annotated[Session, Depends(get_db)]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
import re

class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class RegisterRequest(CamelModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(default="", max_length=80)
    last_name: str = Field(default="", max_length=80)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def _bcrypt_safe(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(f"password must be at most {BCRYPT_MAX_BYTES} bytes")
        return v


class LoginRequest(CamelModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class UserOut(CamelModel):
    id: int
    email: str
    first_name: str
    last_name: str
    tier: Literal["guest", "freemium", "pro"]
    profile_data: dict[str, Any]


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class SrsState(CamelModel):
    repetitions: int
    interval: int
    ease_factor: float
    next_review_date: int
    last_quality: int | None = None
    last_reviewed: int | None = None
    due: bool


class CardOut(CamelModel):
    id: str
    book_id: str
    kind: Literal["core", "sandbox", "diagram"]
    rule_number_or_chapter: str
    title: str
    body: str
    topic: str
    # core
    zeigarnik_cliffhanger: str
    unlock: str
    # sandbox
    interactive_type: str | None
    interactive_data: dict[str, Any] | None
    # diagram
    svg: str | None
    caption: str
    insight: str
    # shared
    image_url: str | None
    likes: int
    saves: int
    source: str
    author: str
    cover: str
    cover_color: str
    srs: SrsState | None = None


class BookOut(CamelModel):
    id: str
    title: str
    author: str
    description: str
    topic: str
    cover_color: str
    cover_image: str | None
    glyph: str
    minutes: int
    year: int | None
    related_topics: list[str]
    similar_book_ids: list[str]
    card_count: int


class BookDetailOut(BookOut):
    cards: list[CardOut]


class FeedResponse(CamelModel):
    items: list[CardOut]
    total_due: int
    at_cap: bool
    tier: str


class IngestResponse(CamelModel):
    book: BookOut
    cards: list[CardOut]
    counts: dict[str, int]


class StashOut(CamelModel):
    id: str
    title: str
    description: str
    emoji: str
    color: str
    created_at: int
    card_ids: list[str]
    card_count: int
    # False for the curated defaults (user_id IS NULL) - the client greys out
    # rename/delete on those.
    owned: bool


class StashCreateRequest(CamelModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=2000)
    emoji: str = Field(default="📚", max_length=16)
    color: str = Field(default="#7b2ff7", max_length=16)


class ToggleCardRequest(CamelModel):
    card_id: str = Field(min_length=1, max_length=160)


class ToggleCardResponse(CamelModel):
    added: bool
    count: int
    # Toggling a card into a curated default forks it into a private copy;
    # this is the id the client must use from then on.
    stash_id: str


class CommentOut(CamelModel):
    id: str
    card_id: str
    author: str
    avatar: str
    color: str
    text: str
    likes: int
    parent_id: str | None
    created_at: int
    replies: list["CommentOut"] = []


class CommentThreadResponse(CamelModel):
    card_id: str
    total: int
    comments: list[CommentOut]


class CommentCreateRequest(CamelModel):
    text: str = Field(min_length=1, max_length=4000)
    parent_id: str | None = None
    # Guest identity, supplied by the client. Ignored when a JWT is present -
    # a signed-in comment is always attributed from the user record.
    author: str | None = Field(default=None, max_length=100)
    avatar: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, max_length=16)


class CommentLikeRequest(CamelModel):
    # The client owns per-viewer like state (there is no likes join table), so
    # it tells us which way the toggle went. Omitted -> plain increment.
    liked: bool | None = None


class CommentLikeResponse(CamelModel):
    id: str
    likes: int
    liked: bool


class ReviewRequest(CamelModel):
    card_id: str
    quality: int = Field(ge=0, le=5, description="SM-2 grade. hard=2, good=4, easy=5.")


class ReviewResponse(CamelModel):
    card_id: str
    srs: SrsState
    previews: dict[str, int]


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def srs_state(review: CardReview | None, now: int) -> SrsState | None:
    if review is None:
        return None
    return SrsState(
        repetitions=review.repetitions,
        interval=review.interval,
        ease_factor=review.ease_factor,
        next_review_date=review.next_review_date,
        last_quality=review.last_quality,
        last_reviewed=review.last_reviewed,
        due=review.next_review_date <= now,
    )


def card_out(card: Flashcard, review: CardReview | None = None, now: int | None = None) -> CardOut:
    """Flatten a Flashcard (+ the caller's SM-2 state) into the wire shape."""
    book = card.book
    return CardOut(
        id=card.id,
        book_id=card.book_id,
        kind=card.kind,  # type: ignore[arg-type]
        rule_number_or_chapter=card.rule_or_chapter,
        title=card.title,
        body=card.body,
        topic=card.topic or (book.topic if book else ""),
        zeigarnik_cliffhanger=card.zeigarnik_cliffhanger,
        unlock=card.unlock_text,
        interactive_type=card.interactive_type,
        interactive_data=card.interactive_data,
        svg=card.diagram_svg,
        caption=card.caption,
        insight=card.insight,
        image_url=card.image_url,
        likes=card.likes,
        saves=card.saves,
        source=book.title if book else "",
        author=book.author if book else "",
        cover=book.glyph if book else "📘",
        cover_color=book.cover_color if book else "#8B5FBF",
        srs=srs_state(review, now if now is not None else now_ms()),
    )


def book_out(book: Book) -> BookOut:
    return BookOut(
        id=book.id,
        title=book.title,
        author=book.author,
        description=book.description,
        topic=book.topic,
        cover_color=book.cover_color,
        cover_image=book.cover_image,
        glyph=book.glyph,
        minutes=book.minutes,
        year=book.year,
        related_topics=book.related_topics or [],
        similar_book_ids=book.similar_book_ids or [],
        card_count=len(book.cards),
    )


def stash_out(stash: Stash) -> StashOut:
    cards = list(stash.cards)
    return StashOut(
        id=stash.id,
        title=stash.title,
        description=stash.description or "",
        emoji=stash.emoji,
        color=stash.color,
        created_at=stash.created_at,
        card_ids=[c.id for c in cards],
        card_count=len(cards),
        owned=stash.user_id is not None,
    )


def comment_out(comment: Comment, replies: list[Comment] | None = None) -> CommentOut:
    return CommentOut(
        id=comment.id,
        card_id=comment.card_id,
        author=comment.author,
        avatar=comment.avatar,
        color=comment.color,
        text=comment.text,
        likes=comment.likes,
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        replies=[comment_out(r) for r in (replies or [])],
    )


# ---------------------------------------------------------------------------
# Variable reward engine (mirrors app.js `variableReward`)
# ---------------------------------------------------------------------------

REWARD_WEIGHTS = {"core": 0.6, "sandbox": 0.2, "diagram": 0.2}


def variable_reward(cards: list[Flashcard], preferred_topics: set[str]) -> list[Flashcard]:
    """Weighted draw without replacement across the three card kinds.

    Renormalises as pools empty so no kind is ever starved, which is what
    makes the ordering feel unpredictable instead of round-robin.
    """
    pools: dict[str, list[Flashcard]] = {"core": [], "sandbox": [], "diagram": []}
    for card in cards:
        pools.setdefault(card.kind, pools["core"]).append(card)

    for kind, pool in pools.items():
        random.shuffle(pool)
        if preferred_topics:
            pool.sort(key=lambda c: c.topic not in preferred_topics)
        pools[kind] = pool

    out: list[Flashcard] = []
    while any(pools.values()):
        available = [k for k, v in pools.items() if v]
        total = sum(REWARD_WEIGHTS.get(k, 0.01) for k in available)
        roll = random.random() * total
        pick = available[0]
        for kind in available:
            roll -= REWARD_WEIGHTS.get(kind, 0.01)
            if roll <= 0:
                pick = kind
                break
        out.append(pools[pick].pop(0))
    return out


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # synapse.db is the single source of truth for the catalogue, so the
    # curated books/cards/stashes/threads have to exist before the first
    # request. No-ops once the books table is non-empty, so restarts and
    # AI-ingested books are both safe.
    with SessionLocal() as session:
        try:
            seed_database_if_empty(session)
        except Exception:
            logger.exception("Seeding failed - the API is up but the catalogue is empty.")

    if settings.secret_key == "dev-only-insecure-change-me":
        logger.warning("SECRET_KEY is the insecure default - set it before deploying.")
    logger.info("Synapse Feed API ready.")
    yield


app = FastAPI(
    title="Synapse Feed API",
    version="1.0.0",
    description="Microlearning backend: AI PDF ingestion, card feed, SM-2 sync.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, Any]:
    return {"status": "ok", "time": now_ms()}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register", response_model=TokenResponse, status_code=201, tags=["auth"])
def register(payload: RegisterRequest, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists.")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        tier="freemium",
        profile_data={},
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        # The SELECT above catches the ordinary case, but two requests for the
        # same address can both pass it and race to the INSERT. The UNIQUE
        # index on users.email is what actually decides; without this the loser
        # returns 500 instead of the 409 the first duplicate got.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with that email already exists."
        ) from None

    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@app.post("/api/auth/login", response_model=TokenResponse, tags=["auth"])
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    # Same message and roughly the same work either way - don't leak which
    # emails are registered.
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")

    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@app.get("/api/auth/me", response_model=UserOut, tags=["auth"])
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------


@app.post("/api/ingest/pdf", response_model=IngestResponse, status_code=201, tags=["ingest"])
async def ingest_pdf(
    db: DbSession,
    user: OptionalUser,
    file: Annotated[UploadFile, File(description="Non-fiction PDF to ingest.")],
    topic: Annotated[str, Form(description="Category, e.g. 'Personal Development'.")] = "General",
) -> IngestResponse:
    """Upload a PDF, extract it, and generate a 60/20/20 card deck from it.

    Synchronous by design so the client gets the deck back in one call. It is
    slow (one Gemini request per chunk, fanned out ``llm_concurrency`` wide) -
    if you put this behind a proxy, raise the read timeout accordingly, or move
    it to a task queue and poll.
    """
    # Guest-tolerant: signed-out uploads are allowed so the ingest flow can be
    # exercised before the frontend's sign-in is wired to real JWTs. Books are
    # not owned by a user (no FK), so this id only labels the log line.
    user_id = user.id if user else 1

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .pdf files are accepted.")

    tmp_path: str | None = None
    try:
        # Stream to disk so a large upload never has to fit in memory whole,
        # and so the size cap is enforced before we finish reading.
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp_path = tmp.name
            written = 0
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"PDF exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit.",
                    )
                tmp.write(chunk)

        if written == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

        # Trust the bytes, not the extension.
        with open(tmp_path, "rb") as fh:
            if fh.read(5) != b"%PDF-":
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a valid PDF.")

        try:
            book = await ai_ingestion.process_book_pdf(tmp_path, topic.strip() or "General", db)
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        except Exception as exc:
            db.rollback()
            logger.exception("Ingestion failed for %s", file.filename)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, f"Ingestion failed: {exc}"
            ) from exc

        db.commit()
        db.refresh(book)

        cards = list(book.cards)
        counts = {kind: sum(1 for c in cards if c.kind == kind) for kind in ("core", "sandbox", "diagram")}
        logger.info("Ingested '%s' (%s) for user %s: %s", book.title, book.id, user_id, counts)

        return IngestResponse(
            book=book_out(book),
            cards=[card_out(c) for c in cards],
            counts=counts,
        )
    finally:
        await file.close()
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------


@app.get("/api/books", response_model=list[BookOut], tags=["books"])
def list_books(
    db: DbSession,
    topic: Annotated[str | None, Query(description="Filter by topic.")] = None,
    q: Annotated[str | None, Query(description="Search title/author.")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    include_pools: Annotated[bool, Query(alias="includePools")] = False,
) -> list[BookOut]:
    stmt = select(Book)
    if not include_pools:
        # "pool" books are attribution containers for the feed's standalone
        # cards (Micro-sandbox, Visual model, a podcast…), not part of the
        # curated shelf. GET /api/books/{slug} still resolves them.
        stmt = stmt.where(Book.source != "pool")
    if topic:
        stmt = stmt.where(Book.topic == topic)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Book.title.ilike(like) | Book.author.ilike(like))
    stmt = stmt.order_by(Book.created_at.desc()).limit(limit).offset(offset)
    return [book_out(b) for b in db.scalars(stmt)]


@app.get("/api/books/{book_slug}", response_model=BookDetailOut, tags=["books"])
def get_book(book_slug: str, db: DbSession, user: OptionalUser) -> BookDetailOut:
    book = db.get(Book, book_slug)
    if book is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found.")

    now = now_ms()
    reviews = _reviews_for(db, user, [c.id for c in book.cards])
    return BookDetailOut(
        **book_out(book).model_dump(by_alias=False),
        cards=[card_out(c, reviews.get(c.id), now) for c in book.cards],
    )


def _reviews_for(db: Session, user: User | None, card_ids: list[str]) -> dict[str, CardReview]:
    """Load this user's SM-2 records for the given cards, keyed by card id."""
    if user is None or not card_ids:
        return {}
    rows = db.scalars(
        select(CardReview).where(
            CardReview.user_id == user.id, CardReview.card_id.in_(card_ids)
        )
    )
    return {r.card_id: r for r in rows}


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------


@app.get("/api/feed", response_model=FeedResponse, tags=["feed"])
def get_feed(
    db: DbSession,
    user: OptionalUser,
    topic: Annotated[str | None, Query(description="Restrict to one topic.")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    due_only: Annotated[bool, Query(alias="dueOnly")] = False,
) -> FeedResponse:
    """The variable-reward card stream, filtered by SM-2 due dates.

    A card is eligible when it has never been reviewed (new) or its
    ``nextReviewDate`` has passed. Guests get the same 60/20/20 draw with no
    scheduling state attached.
    """
    now = now_ms()

    stmt = select(Flashcard)
    if topic:
        stmt = stmt.where(Flashcard.topic == topic)
    cards = list(db.scalars(stmt))
    if not cards:
        return FeedResponse(items=[], total_due=0, at_cap=False, tier=user.tier if user else "guest")

    reviews = _reviews_for(db, user, [c.id for c in cards])

    def is_due(card: Flashcard) -> bool:
        review = reviews.get(card.id)
        return review is None or review.next_review_date <= now

    eligible = [c for c in cards if is_due(c)]
    total_due = len(eligible)
    if due_only:
        cards = eligible
    elif not eligible:
        cards = []          # everything is scheduled - the "all caught up" state
    else:
        cards = eligible

    preferred = set((user.profile_data or {}).get("topics", [])) if user else set()
    ordered = variable_reward(cards, preferred)

    # Freemium sees a capped daily slice; Pro and guests are uncapped here
    # (guests are gated in the UI instead).
    tier = user.tier if user else "guest"
    effective = min(limit, settings.freemium_daily_cap) if tier == "freemium" else limit
    items = ordered[:effective]

    return FeedResponse(
        items=[card_out(c, reviews.get(c.id), now) for c in items],
        total_due=total_due,
        at_cap=tier == "freemium" and len(ordered) > effective,
        tier=tier,
    )


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


@app.post("/api/cards/review", response_model=ReviewResponse, tags=["reviews"])
def submit_review(payload: ReviewRequest, db: DbSession, user: CurrentUser) -> ReviewResponse:
    """Record an SM-2 grade and return the updated schedule.

    Idempotent per grade, not per call: grading the same card twice applies
    the ladder twice, exactly as the offline ``db.js`` store does.
    """
    card = db.get(Flashcard, payload.card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found.")

    review = db.scalar(
        select(CardReview).where(
            CardReview.user_id == user.id, CardReview.card_id == card.id
        )
    )
    if review is None:
        review = CardReview(user_id=user.id, card_id=card.id)
        db.add(review)

    apply_review(review, clamp_quality(payload.quality))
    db.commit()
    db.refresh(review)

    return ReviewResponse(
        card_id=card.id,
        srs=srs_state(review, now_ms()),  # type: ignore[arg-type]
        previews={
            "hard": preview_interval(review, 2),
            "good": preview_interval(review, 4),
            "easy": preview_interval(review, 5),
        },
    )


@app.get("/api/cards/due-count", tags=["reviews"])
def due_count(db: DbSession, user: CurrentUser) -> dict[str, int]:
    """Counts powering the sidebar 'cards to review' indicator."""
    now = now_ms()
    total = db.scalar(select(func.count()).select_from(Flashcard)) or 0
    reviewed = db.scalar(
        select(func.count()).select_from(CardReview).where(CardReview.user_id == user.id)
    ) or 0
    due = db.scalar(
        select(func.count())
        .select_from(CardReview)
        .where(CardReview.user_id == user.id, CardReview.next_review_date <= now)
    ) or 0
    return {"due": due, "fresh": total - reviewed, "scheduled": reviewed - due, "total": total}


# ---------------------------------------------------------------------------
# Stashes
# ---------------------------------------------------------------------------
# A stash is public learning content, not personal data: the curated defaults
# (user_id IS NULL) are world-readable, and a user's own stashes hold nothing
# but a title, a colour and a list of card ids. That is exactly what makes
# them safe for the client to mirror into IndexedDB - see db.js.
# ---------------------------------------------------------------------------


def _fork_id(default_id: str, user_id: int) -> str:
    """Deterministic id of a user's private copy of a curated stash."""
    return f"{default_id}-u{user_id}"


@app.get("/api/stashes", response_model=list[StashOut], tags=["stashes"])
def list_stashes(db: DbSession, user: OptionalUser) -> list[StashOut]:
    """The curated default stashes, plus the caller's own if signed in."""
    condition = Stash.user_id.is_(None)
    if user is not None:
        condition = condition | (Stash.user_id == user.id)

    stmt = select(Stash).where(condition).order_by(
        # Owned stashes first (newest first), then the curated defaults.
        Stash.user_id.is_(None), Stash.created_at.desc()
    )
    rows = list(db.scalars(stmt))

    if user is not None:
        # Once a user has forked a curated stash, their copy replaces it -
        # otherwise the picker shows the same title twice with different
        # contents, and it is ambiguous which one a tap would write to.
        owned = {s.id for s in rows if s.user_id == user.id}
        rows = [s for s in rows if s.user_id is not None or _fork_id(s.id, user.id) not in owned]

    return [stash_out(s) for s in rows]


@app.post("/api/stashes", response_model=StashOut, status_code=201, tags=["stashes"])
def create_stash(payload: StashCreateRequest, db: DbSession, user: CurrentUser) -> StashOut:
    """Create a stash owned by the signed-in user."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Stash title can't be empty.")

    stash = Stash(
        # ms stamp keeps ids sortable; the suffix stops two creates in the
        # same millisecond from colliding on the primary key.
        id=f"cs-{now_ms()}-{secrets.token_hex(3)}",
        user_id=user.id,
        title=title,
        description=payload.description.strip(),
        emoji=payload.emoji or "📚",
        color=payload.color or "#7b2ff7",
    )
    db.add(stash)
    db.commit()
    db.refresh(stash)
    return stash_out(stash)


@app.post(
    "/api/stashes/{stash_id}/toggle-card",
    response_model=ToggleCardResponse,
    tags=["stashes"],
)
def toggle_stash_card(
    stash_id: str, payload: ToggleCardRequest, db: DbSession, user: CurrentUser
) -> ToggleCardResponse:
    """Add or remove a card from a stash.

    Toggling against a curated default would edit what every visitor sees, so
    the first write forks it into a private copy owned by the caller (the same
    copy-on-write the old localStorage implementation did) and the response
    reports the id the client should use from then on.
    """
    stash = db.get(Stash, stash_id)
    if stash is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stash not found.")
    if db.get(Flashcard, payload.card_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found.")

    if stash.user_id is None:
        stash = _fork_default_stash(db, stash, user)
    elif stash.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That stash belongs to someone else.")

    link = db.get(StashCard, {"stash_id": stash.id, "card_id": payload.card_id})
    if link is None:
        db.add(StashCard(stash_id=stash.id, card_id=payload.card_id))
        added = True
    else:
        db.delete(link)
        added = False

    db.commit()
    count = db.scalar(
        select(func.count()).select_from(StashCard).where(StashCard.stash_id == stash.id)
    ) or 0
    return ToggleCardResponse(added=added, count=count, stash_id=stash.id)


def _fork_default_stash(db: Session, default: Stash, user: User) -> Stash:
    """Return this user's private copy of a curated stash, creating it once."""
    fork_id = _fork_id(default.id, user.id)
    fork = db.get(Stash, fork_id)
    if fork is not None:
        return fork

    fork = Stash(
        id=fork_id,
        user_id=user.id,
        title=default.title,
        description=default.description,
        emoji=default.emoji,
        color=default.color,
    )
    db.add(fork)
    db.flush()
    for card in default.cards:
        db.add(StashCard(stash_id=fork.id, card_id=card.id))
    db.flush()
    return fork


# ---------------------------------------------------------------------------
# Discussions
# ---------------------------------------------------------------------------


@app.get(
    "/api/cards/{card_id}/comments",
    response_model=CommentThreadResponse,
    tags=["discussions"],
)
def list_card_comments(card_id: str, db: DbSession) -> CommentThreadResponse:
    """Every comment on a card, as top-level threads with nested replies."""
    if db.get(Flashcard, card_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found.")

    rows = list(
        db.scalars(
            select(Comment).where(Comment.card_id == card_id).order_by(Comment.created_at)
        )
    )

    replies_by_parent: dict[str, list[Comment]] = {}
    for row in rows:
        if row.parent_id:
            replies_by_parent.setdefault(row.parent_id, []).append(row)

    threads = [comment_out(r, replies_by_parent.get(r.id, [])) for r in rows if not r.parent_id]
    return CommentThreadResponse(card_id=card_id, total=len(rows), comments=threads)


@app.post(
    "/api/cards/{card_id}/comments",
    response_model=CommentOut,
    status_code=201,
    tags=["discussions"],
)
def create_card_comment(
    card_id: str, payload: CommentCreateRequest, db: DbSession, user: OptionalUser
) -> CommentOut:
    """Post a comment (or a reply, via ``parentId``) under a card."""
    if db.get(Flashcard, card_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found.")

    text = payload.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment can't be empty.")

    parent_id = payload.parent_id
    if parent_id:
        parent = db.get(Comment, parent_id)
        if parent is None or parent.card_id != card_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent comment not found on this card.")
        # One level of nesting - a reply to a reply attaches to its thread root,
        # matching what the drawer renders.
        parent_id = parent.parent_id or parent.id

    author, avatar, color = _comment_identity(user, payload)

    comment = Comment(
        id=f"uc-{now_ms()}-{secrets.token_hex(3)}",
        card_id=card_id,
        user_id=user.id if user else None,
        author=author,
        avatar=avatar,
        color=color,
        text=text,
        likes=0,
        parent_id=parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment_out(comment)


def _comment_identity(user: User | None, payload: CommentCreateRequest) -> tuple[str, str, str]:
    """Display name / initials / colour for a new comment.

    A signed-in comment is attributed from the user record - the client cannot
    override it. Guests supply their own display name, which is stored as a
    plain label and never linked to an account.
    """
    color = (payload.color or "#7b2ff7")[:16]

    if user is not None:
        name = user.full_name or user.email.split("@")[0]
        initials = "".join(p[0] for p in name.split()[:2]).upper() or "?"
        return name[:100], initials[:16], color

    name = (payload.author or "Guest").strip()[:100] or "Guest"
    avatar = (payload.avatar or name[:1].upper() or "?")[:16]
    return name, avatar, color


@app.post(
    "/api/comments/{comment_id}/like",
    response_model=CommentLikeResponse,
    tags=["discussions"],
)
def like_comment(
    comment_id: str, db: DbSession, payload: CommentLikeRequest | None = None
) -> CommentLikeResponse:
    """Apply a like toggle to a comment.

    There is no per-user likes table, so the client is the authority on its own
    like state and sends the direction it just moved in (``liked``). Without a
    body this degrades to a plain increment. The counter is floored at zero so
    a stale client can't push it negative.
    """
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")

    liked = True if payload is None or payload.liked is None else payload.liked
    comment.likes = max(0, (comment.likes or 0) + (1 if liked else -1))
    db.commit()
    db.refresh(comment)
    return CommentLikeResponse(id=comment.id, likes=comment.likes, liked=liked)


from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=_project_root, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, reload=True)
