"""
seed.py - first-boot population of synapse.db from the curated catalogue.

Why this exists
---------------
The 25 curated books, their cards, the default stashes and the seed
discussion threads used to live only in the browser (``data.js`` +
``localStorage``). ``synapse.db`` is now the single source of truth, so the
catalogue has to exist server-side before the first request lands.

Where the data comes from
-------------------------
``backend/seed_data.json``, generated from ``data.js`` by
``backend/tools/export_seed.js``. Keeping the payload in a generated JSON file
rather than hand-transcribed Python literals means data.js stays the editorial
source and the two can never silently drift: re-run the exporter, delete
``synapse.db``, restart.

Idempotency
-----------
``seed_database_if_empty`` returns immediately if the ``books`` table has any
rows, so it is safe to call on every startup - including after an AI PDF
ingestion has added books of its own.

Time convention
---------------
``data.js`` wrote stash and comment timestamps as ``Date.now() - N days``,
i.e. relative to page load. The exporter therefore stores the *offset*
(``created_days_ago``) and the seeder anchors it to the moment the database is
first created, so a freshly seeded install shows a plausible recent history
instead of dates frozen at export time.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .ai_ingestion import sanitize_svg
from .models import Book, Comment, Flashcard, Stash, StashCard, now_ms

logger = logging.getLogger("synapse.seed")

SEED_FILE = Path(__file__).resolve().parent / "seed_data.json"

DAY_MS = 86_400_000


def load_seed_payload(path: Path | None = None) -> dict[str, Any]:
    """Read the generated catalogue. Raises if it is missing or malformed."""
    src = path or SEED_FILE
    with src.open(encoding="utf-8") as fh:
        return json.load(fh)


def seed_database_if_empty(db: Session, *, path: Path | None = None) -> bool:
    """Populate an empty database with the curated catalogue.

    Returns True if seeding ran, False if the database already had books.
    Commits on success; rolls back and re-raises on failure so a half-written
    catalogue never survives startup.
    """
    if db.scalar(select(func.count()).select_from(Book)):
        logger.info("Books already present - skipping seed.")
        return False

    src = path or SEED_FILE
    if not src.exists():
        logger.warning(
            "Seed file %s is missing - starting with an empty catalogue. "
            "Run `node backend/tools/export_seed.js` to regenerate it.",
            src,
        )
        return False

    payload = load_seed_payload(src)
    now = now_ms()

    try:
        counts = _insert(db, payload, now)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Seeding failed - database left empty.")
        raise

    logger.info(
        "Seeded synapse.db: %(books)s books (%(curated)s curated + %(pool)s source pools), "
        "%(cards)s cards (core %(core)s / sandbox %(sandbox)s / diagram %(diagram)s), "
        "%(stashes)s stashes, %(stash_cards)s stash links, %(comments)s comments.",
        counts,
    )
    return True


# ---------------------------------------------------------------------------
# Insertion
# ---------------------------------------------------------------------------


def _insert(db: Session, payload: dict[str, Any], now: int) -> dict[str, int]:
    books: list[dict[str, Any]] = payload.get("books", [])
    cards: list[dict[str, Any]] = payload.get("cards", [])
    stashes: list[dict[str, Any]] = payload.get("stashes", [])
    comments: list[dict[str, Any]] = payload.get("comments", [])

    for row in books:
        db.add(
            Book(
                id=row["id"],
                title=row["title"],
                author=row.get("author", ""),
                description=row.get("description", ""),
                topic=row.get("topic", ""),
                cover_color=row.get("cover_color", "#8B5FBF"),
                cover_image=row.get("cover_image"),
                glyph=row.get("glyph", "📘"),
                minutes=row.get("minutes", 8),
                year=row.get("year"),
                related_topics=row.get("related_topics", []),
                similar_book_ids=row.get("similar_book_ids", []),
                source=row.get("source", "seed"),
                created_at=now,
            )
        )
    db.flush()  # books must exist before flashcards reference them

    kinds = {"core": 0, "sandbox": 0, "diagram": 0}
    seeded_card_ids: set[str] = set()

    for row in cards:
        kind = row["kind"]
        svg = row.get("diagram_svg")
        if svg:
            # Re-run the same allowlist the AI ingestion path uses. The seed
            # markup is hand-written and trusted, but routing every SVG
            # through one sanitiser means the database can never hold markup
            # the client would refuse to render - and a future edit to
            # data.js cannot smuggle a <script> in through the back door.
            clean = sanitize_svg(svg)
            if not clean:
                logger.warning("Diagram %s failed SVG sanitisation - storing without markup.", row["id"])
            svg = clean or None

        db.add(
            Flashcard(
                id=row["id"],
                book_id=row["book_id"],
                kind=kind,
                position=row.get("position", 0),
                rule_or_chapter=row.get("rule_or_chapter", ""),
                title=row["title"],
                body=row.get("body", ""),
                topic=row.get("topic", ""),
                zeigarnik_cliffhanger=row.get("zeigarnik_cliffhanger", ""),
                unlock_text=row.get("unlock_text", ""),
                interactive_type=row.get("interactive_type"),
                interactive_data=row.get("interactive_data"),
                diagram_svg=svg,
                caption=row.get("caption", ""),
                insight=row.get("insight", ""),
                image_url=row.get("image_url"),
                likes=row.get("likes", 0),
                saves=row.get("saves", 0),
                created_at=now,
            )
        )
        kinds[kind] = kinds.get(kind, 0) + 1
        seeded_card_ids.add(row["id"])
    db.flush()

    # --- default (public) stashes: user_id stays NULL ---
    stash_links = 0
    for row in stashes:
        db.add(
            Stash(
                id=row["id"],
                user_id=None,
                title=row["title"],
                description=row.get("description", ""),
                emoji=row.get("emoji", "📚"),
                color=row.get("color", "#7b2ff7"),
                created_at=now - int(row.get("created_days_ago", 0)) * DAY_MS,
            )
        )
    db.flush()

    for row in stashes:
        for card_id in row.get("card_ids", []):
            if card_id not in seeded_card_ids:
                logger.warning("Stash %s references unknown card %s - skipped.", row["id"], card_id)
                continue
            db.add(StashCard(stash_id=row["id"], card_id=card_id))
            stash_links += 1

    # --- seed discussion threads ---
    # Parents first so a reply's parent_id always resolves, whatever order the
    # export happened to emit.
    ordered = sorted(comments, key=lambda c: (c.get("parent_id") is not None, c.get("id", "")))
    for row in ordered:
        if row["card_id"] not in seeded_card_ids:
            logger.warning("Comment %s targets unknown card %s - skipped.", row["id"], row["card_id"])
            continue
        db.add(
            Comment(
                id=row["id"],
                card_id=row["card_id"],
                user_id=None,  # seed threads are authored by curated personas
                author=row.get("author", "Anonymous"),
                avatar=row.get("avatar", "?"),
                color=row.get("color", "#7b2ff7"),
                text=row["text"],
                likes=row.get("likes", 0),
                parent_id=row.get("parent_id"),
                created_at=now - int(row.get("created_days_ago", 0)) * DAY_MS,
            )
        )

    curated = sum(1 for b in books if b.get("source") != "pool")
    return {
        "books": len(books),
        "curated": curated,
        "pool": len(books) - curated,
        "cards": len(cards),
        "core": kinds.get("core", 0),
        "sandbox": kinds.get("sandbox", 0),
        "diagram": kinds.get("diagram", 0),
        "stashes": len(stashes),
        "stash_cards": stash_links,
        "comments": len(comments),
    }


__all__ = ["SEED_FILE", "load_seed_payload", "seed_database_if_empty"]
