"""
ai_ingestion.py - PDF ➜ PyMuPDF extraction ➜ Gemini ➜ structured 60/20/20 cards.

Pipeline
--------
1. ``extract_chunks``      PyMuPDF text extraction, chapter-aware (uses the
                           embedded TOC when present), OCR fallback for
                           image-only pages.
2. ``generate_book_meta``  One Gemini call for title/author/description.
3. ``generate_cards``      One Gemini call per chunk, fanned out concurrently,
                           each returning 3 core + 1 sandbox + 1 diagram
                           (= exactly the 60/20/20 mix).
4. ``persist_book``        Writes Book + Flashcard rows.

``process_book_pdf`` composes all four.

Security
--------
Two LLM outputs reach the browser as executable-ish content, so both are
validated server-side before they are ever stored:

* **Diagram SVG** is parsed and rebuilt against a tag/attribute allowlist
  (``sanitize_svg``). The frontend injects it via ``innerHTML``, so an
  unsanitised ``<script>`` or ``onload=`` would be stored XSS.
* **Sandbox formulas** replace ``data.js``'s ``compute()`` JS closures. We
  cannot ship executable JS from a model, so the model emits an arithmetic
  *expression* which is validated through Python's ``ast`` against a node
  allowlist and smoke-evaluated (``validate_formula``). The frontend must
  evaluate it with a small arithmetic parser - **never ``eval()``**.
"""

from __future__ import annotations

import ast
import asyncio
import logging
import math
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

import httpx
from pathlib import Path
import sys

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from backend.database import settings
from backend.models import Book, Flashcard, now_ms

logger = logging.getLogger(__name__)

try:  # PyMuPDF >= 1.24 exposes the `pymupdf` name; older builds use `fitz`.
    import pymupdf as fitz
except ImportError:  # pragma: no cover
    import fitz  # type: ignore[no-redef]


# ---------------------------------------------------------------------------
# 1. PDF extraction
# ---------------------------------------------------------------------------

MIN_CHARS_FOR_TEXT_PAGE = 120  # below this a page is treated as scanned
MIN_CHUNK_CHARS = 400          # chunks shorter than this yield weak cards
MAX_CHUNK_CHARS = 12_000       # ~3k tokens; keeps per-call cost predictable


@dataclass(slots=True)
class Chunk:
    """A chapter-sized slice of the book."""

    label: str   # "Chapter 3" / "Pages 40–58"
    text: str


def _clean(text: str) -> str:
    """Normalise PDF text: de-hyphenate, collapse whitespace, drop ligatures."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"-\n(?=\w)", "", text)      # join words split across lines
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _page_text(page: Any, allow_ocr: bool) -> str:
    """Extract a page's text, falling back to OCR for image-only pages."""
    text = page.get_text("text") or ""
    if len(text.strip()) >= MIN_CHARS_FOR_TEXT_PAGE or not allow_ocr:
        return text
    try:
        # Needs the Tesseract binary; raises if unavailable.
        return page.get_textpage_ocr(flags=0, full=False).extractText() or text
    except Exception as exc:  # noqa: BLE001 - OCR is strictly best-effort
        logger.debug("OCR unavailable for page %s: %s", page.number, exc)
        return text


def _window(pages: list[str], label_prefix: str = "Pages") -> list[Chunk]:
    """Group pages into ~MAX_CHUNK_CHARS windows when there is no usable TOC."""
    chunks: list[Chunk] = []
    buf: list[str] = []
    start = 1
    size = 0

    for idx, text in enumerate(pages, start=1):
        buf.append(text)
        size += len(text)
        if size >= MAX_CHUNK_CHARS:
            chunks.append(Chunk(f"{label_prefix} {start}–{idx}", _clean("\n".join(buf))))
            buf, size, start = [], 0, idx + 1

    if buf:
        body = _clean("\n".join(buf))
        if body:
            chunks.append(Chunk(f"{label_prefix} {start}–{len(pages)}", body))
    return chunks


def extract_chunks(file_path: str, *, allow_ocr: bool = True, max_chunks: int | None = None) -> list[Chunk]:
    """Extract chapter-sized text chunks from a PDF.

    Prefers the embedded table of contents so cards can cite real chapter
    labels ("Chapter 3"); falls back to fixed-size page windows.
    """
    max_chunks = max_chunks or settings.max_chunks_per_book

    with fitz.open(file_path) as doc:
        if doc.is_encrypted and not doc.authenticate(""):
            raise ValueError("PDF is password-protected and cannot be read.")

        pages = [_page_text(page, allow_ocr) for page in doc]
        toc = doc.get_toc() or []
        page_count = doc.page_count

    if not any(p.strip() for p in pages):
        raise ValueError(
            "No extractable text found. The PDF appears to be scanned images; "
            "install Tesseract (apt install tesseract-ocr) to enable OCR."
        )

    chunks: list[Chunk] = []

    # Top-level TOC entries -> chapter boundaries.
    tops = [(lvl, title, pg) for lvl, title, pg in toc if lvl == 1 and 0 < pg <= page_count]
    if len(tops) >= 2:
        for i, (_lvl, title, start_pg) in enumerate(tops):
            end_pg = tops[i + 1][2] - 1 if i + 1 < len(tops) else page_count
            body = _clean("\n".join(pages[start_pg - 1 : end_pg]))
            if len(body) < MIN_CHUNK_CHARS:
                continue
            chunks.append(Chunk(title.strip()[:120], body[:MAX_CHUNK_CHARS]))

    if not chunks:
        chunks = _window(pages)

    chunks = [c for c in chunks if len(c.text) >= MIN_CHUNK_CHARS]
    if not chunks:
        raise ValueError("PDF text was too sparse to build cards from.")

    # Sample evenly across the whole book rather than truncating to the first
    # N chapters - otherwise long books only ever yield front-matter cards.
    if len(chunks) > max_chunks:
        stride = len(chunks) / max_chunks
        chunks = [chunks[int(i * stride)] for i in range(max_chunks)]

    return chunks


# ---------------------------------------------------------------------------
# 2. Output schemas (drive Gemini's structured JSON output)
# ---------------------------------------------------------------------------


class BookMeta(BaseModel):
    """Bibliographic metadata inferred from the opening pages."""

    title: str = Field(description="Book title, exactly as printed.")
    author: str = Field(description="Author name(s). Empty string if not stated.")
    description: str = Field(description="2–3 sentence editorial summary of the book's core argument.")
    glyph: str = Field(description="A single emoji that evokes the book's subject.")
    cover_color: str = Field(description="Hex colour matching the book's mood, e.g. '#8B5FBF'.")
    related_topics: list[str] = Field(description="3–4 short topic tags, title case.")
    minutes: int = Field(description="Estimated minutes to read all the key ideas, 5–15.")


class CoreCard(BaseModel):
    """60% - a punchy takeaway that closes with a Zeigarnik hook."""

    rule_or_chapter: str = Field(description="Short locator, e.g. 'Chapter 3' or 'Rule 2'.")
    title: str = Field(description="The insight as a bold claim, under 70 characters.")
    body: str = Field(description="2–3 sentences making the idea concrete. No preamble.")
    zeigarnik_cliffhanger: str = Field(
        description=(
            "An open loop that makes the reader need the answer - names that a "
            "specific mechanism exists without revealing it. Ends with an ellipsis."
        )
    )
    unlock_text: str = Field(description="The payoff that closes the loop above, 1–2 sentences.")
    topic: str = Field(description="Single topic tag, title case.")


class SliderSpec(BaseModel):
    min: float
    max: float
    step: float
    value: float = Field(description="Starting position, between min and max.")
    unit: str = Field(description="Unit suffix shown by the value, e.g. '%' or ' / day'.")
    left_label: str = Field(description="2–3 word label for the low end.")
    right_label: str = Field(description="2–3 word label for the high end.")


class SandboxCard(BaseModel):
    """20% - an interactive model the reader manipulates."""

    title: str = Field(description="The tension being modelled, under 60 characters.")
    prompt: str = Field(description="One or two sentences telling the reader what to drag and why.")
    slider: SliderSpec
    formula: str = Field(
        description=(
            "Arithmetic expression computing the result from the slider value `v`. "
            "Use ONLY: v, numbers, + - * / ** %, parentheses, and the functions "
            "min max abs round pow sqrt log exp floor ceil. No other names, no "
            "assignment, no lambdas. Example: '250 * (v / 100) - 100'."
        )
    )
    result_prefix: str = Field(description="Prefix for the computed value, e.g. '$' or ''.")
    result_suffix: str = Field(description="Suffix for the computed value, e.g. 'x' or ''.")
    result_label: str = Field(description="Caption under the number, e.g. 'expected value per play'.")
    bad_below: float = Field(description="Results below this are a bad outcome.")
    good_above: float = Field(description="Results above this are a good outcome.")
    verdict_bad: str = Field(description="One-line verdict when the result is bad. Be blunt.")
    verdict_neutral: str = Field(description="One-line verdict in the middle band.")
    verdict_good: str = Field(description="One-line verdict when the result is good.")
    topic: str = Field(description="Single topic tag, title case.")


class DiagramCard(BaseModel):
    """20% - a standalone visual fact."""

    title: str = Field(description="What the diagram proves, under 60 characters.")
    caption: str = Field(description="One sentence describing what is plotted.")
    insight: str = Field(description="The 'so what' - one sentence the reader should remember.")
    svg: str = Field(
        description=(
            "A complete standalone inline SVG with viewBox='0 0 320 170'. "
            "Use ONLY these elements: svg, g, path, line, rect, circle, ellipse, "
            "polyline, polygon, text, tspan, defs, linearGradient, stop, style, title. "
            "Style with a <style> block. Use CSS variables var(--text-soft), "
            "var(--border), var(--brand-2) for theme-aware colours, plus literal "
            "hex for data series. No script, no images, no external references, "
            "no event handlers."
        )
    )
    topic: str = Field(description="Single topic tag, title case.")


class ChunkCards(BaseModel):
    """One chunk's worth of cards, pre-split by kind to keep the mix exact."""

    core: list[CoreCard] = Field(description="Exactly 3 core knowledge cards.")
    sandboxes: list[SandboxCard] = Field(description="Exactly 1 interactive sandbox.")
    diagrams: list[DiagramCard] = Field(description="Exactly 1 visual diagram.")


# ---------------------------------------------------------------------------
# 3. Validation - formulas
# ---------------------------------------------------------------------------

_ALLOWED_FUNCS: dict[str, Any] = {
    "min": min, "max": max, "abs": abs, "round": round, "pow": pow,
    "sqrt": math.sqrt, "log": math.log, "exp": math.exp,
    "floor": math.floor, "ceil": math.ceil,
}

_ALLOWED_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load,
    ast.Call, ast.IfExp, ast.Compare, ast.Tuple,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.USub, ast.UAdd,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)


def validate_formula(expr: str, slider: SliderSpec) -> str:
    """Validate a model-authored arithmetic expression.

    Raises ``ValueError`` unless the expression parses to a whitelisted AST
    referencing only ``v`` and the allowed functions, *and* evaluates to a
    finite number across the slider's range.
    """
    expr = expr.strip()
    if not expr or len(expr) > 300:
        raise ValueError("formula empty or too long")

    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"formula is not a valid expression: {exc}") from exc

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError(f"formula uses a disallowed construct: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id != "v" and node.id not in _ALLOWED_FUNCS:
            raise ValueError(f"formula references unknown name: {node.id}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCS:
                raise ValueError("formula calls a disallowed function")
            if node.keywords:
                raise ValueError("formula uses keyword arguments")

    # Smoke-test across the slider range. Globals are stripped, and the AST
    # walk above already proved there is nothing but arithmetic in here.
    code = compile(tree, "<formula>", "eval")
    lo, hi = min(slider.min, slider.max), max(slider.min, slider.max)
    for v in (lo, (lo + hi) / 2, hi):
        try:
            result = eval(code, {"__builtins__": {}}, {"v": v, **_ALLOWED_FUNCS})  # noqa: S307
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"formula failed at v={v}: {exc}") from exc
        if not isinstance(result, (int, float)) or not math.isfinite(result):
            raise ValueError(f"formula produced a non-finite result at v={v}")

    return expr


# ---------------------------------------------------------------------------
# 3b. Validation - SVG
# ---------------------------------------------------------------------------

_SVG_NS = "http://www.w3.org/2000/svg"

_ALLOWED_TAGS = {
    "svg", "g", "path", "line", "rect", "circle", "ellipse", "polyline",
    "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient",
    "stop", "style", "title", "desc",
}

_ALLOWED_ATTRS = {
    "viewBox", "width", "height", "class", "id", "d", "x", "y", "x1", "y1",
    "x2", "y2", "cx", "cy", "r", "rx", "ry", "points", "fill", "stroke",
    "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
    "opacity", "fill-opacity", "stroke-opacity", "transform", "offset",
    "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
    "text-anchor", "dominant-baseline", "font-size", "font-weight",
    "font-family", "dx", "dy", "xmlns",
}

_DANGEROUS_VALUE = re.compile(r"(javascript:|data:text/html|expression\s*\(|<\s*script)", re.I)


def sanitize_svg(raw: str, *, max_bytes: int = 24_000) -> str:
    """Parse and rebuild an SVG against a strict allowlist.

    Anything not explicitly permitted is dropped. Returns "" if the input is
    unusable, so the caller can fall back rather than store unsafe markup.
    """
    if not raw or len(raw.encode("utf-8")) > max_bytes:
        return ""

    # Entity/DTD tricks (billion laughs, external entities) - refuse outright
    # rather than hand them to ElementTree.
    if re.search(r"<!\s*(DOCTYPE|ENTITY)", raw, re.I):
        return ""

    start = raw.find("<svg")
    if start == -1:
        return ""
    raw = raw[start:]

    try:
        root = ET.fromstring(raw)  # noqa: S314 - DTD/entities rejected above
    except ET.ParseError:
        return ""

    def strip_ns(tag: str) -> str:
        return tag.split("}", 1)[1] if "}" in tag else tag

    if strip_ns(root.tag) != "svg":
        return ""

    def scrub(el: ET.Element) -> bool:
        """Clean an element in place. Returns False if it must be removed."""
        tag = strip_ns(el.tag)
        if tag not in _ALLOWED_TAGS:
            return False
        el.tag = tag

        for name, value in list(el.attrib.items()):
            attr = strip_ns(name)
            # Drop every event handler, xlink/href, and anything not allowlisted.
            if (
                attr not in _ALLOWED_ATTRS
                or attr.lower().startswith("on")
                or _DANGEROUS_VALUE.search(value or "")
            ):
                del el.attrib[name]
                continue
            if attr != name:
                del el.attrib[name]
                el.set(attr, value)

        if tag == "style" and _DANGEROUS_VALUE.search(el.text or ""):
            el.text = ""

        for child in list(el):
            if not scrub(child):
                el.remove(child)
        return True

    if not scrub(root):
        return ""

    root.set("xmlns", _SVG_NS)
    if not root.get("viewBox"):
        root.set("viewBox", "0 0 320 170")

    return ET.tostring(root, encoding="unicode", method="xml")


# ---------------------------------------------------------------------------
# 4. Gemini calls
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a senior non-fiction editor building microlearning cards for Synapse Feed.

You turn one chunk of a book into cards that respect a strict 60/20/20 mix:
3 core knowledge cards, 1 interactive sandbox, 1 visual diagram.
"""

_USER_TEMPLATE = """\
Book topic: {topic}
Chunk label: {label}

<chunk>
{text}
</chunk>

Produce exactly 3 core cards, 1 sandbox, and 1 diagram from this chunk.
Use "{label}" as the rule_or_chapter locator on the core cards."""


# The SDK chooses its async transport at runtime: aiohttp when that package is
# importable (it often arrives as someone else's transitive dependency), httpx
# otherwise. The two raise unrelated exception hierarchies and neither derives
# from genai_errors.APIError, so a connection failure would otherwise escape
# the API-error handlers entirely. aiohttp is added only when it is installed.
_TRANSPORT_ERRORS: tuple[type[BaseException], ...] = (httpx.TransportError,)
try:  # pragma: no cover - depends on the installed extras
    import aiohttp

    _TRANSPORT_ERRORS += (aiohttp.ClientError,)
except ImportError:
    pass


def _client() -> genai.Client:
    """Gemini client, with the SDK's env fallback made explicit.

    The key is resolved *before* constructing the client rather than letting
    the SDK raise: a Client whose constructor fails still schedules its async
    finalizer, which then dumps an unrelated AttributeError traceback into the
    server log and buries the real cause.
    """
    api_key = (
        settings.gemini_api_key
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key:
        raise RuntimeError(
            "No Gemini API key configured - set GEMINI_API_KEY in backend/.env "
            "(see backend/.env.example)."
        )
    return genai.Client(api_key=api_key)


def _config(schema: type[BaseModel], *, output_tokens: int) -> types.GenerateContentConfig:
    """Shared config: constrained JSON decoding against a Pydantic schema.

    ``response_schema`` takes the Pydantic class itself - the SDK converts it
    (Field descriptions included) into a Gemini schema and hands back a
    populated instance on ``.parsed``, so there is no hand-rolled JSON parsing
    step here to drift from the model definitions.

    ``thinking_budget`` matters more than it looks: on thinking models reasoning
    tokens are billed against ``max_output_tokens``, so an unbounded budget can
    consume the whole allowance and return *zero* JSON with finish_reason
    MAX_TOKENS. Callers add the budget on top of the JSON they actually need.

    AFC is disabled explicitly. ``should_disable_afc()`` defaults to *False*
    when the field is unset, so leaving it out routes every call through the
    automatic-function-calling loop - pointless here, since we register no
    tools - and makes the SDK log "Direct use of automatic function calling
    (AFC) ... is not recommended" once per process. Setting ``disable=True``
    (and leaving ``maximum_remote_calls`` unset, which would trip a *second*
    warning) takes the direct path instead.
    """
    return types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=schema,
        max_output_tokens=output_tokens + settings.thinking_budget,
        thinking_config=types.ThinkingConfig(thinking_budget=settings.thinking_budget),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )


def _parsed(response: Any, schema: type[BaseModel], what: str) -> Any:
    """Return the parsed payload, or raise explaining why it is missing.

    ``.parsed`` is None whenever the model never produced complete JSON: a
    safety block, a RECITATION stop, or a MAX_TOKENS truncation. Dereferencing
    it blindly would surface as an opaque AttributeError three frames later.
    """
    feedback = getattr(response, "prompt_feedback", None)
    blocked = getattr(feedback, "block_reason", None)
    if blocked:
        raise ValueError(f"Gemini blocked the request for {what} (reason: {blocked}).")

    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed

    candidates = getattr(response, "candidates", None) or []
    finish = getattr(candidates[0], "finish_reason", None) if candidates else None
    if finish == types.FinishReason.MAX_TOKENS:
        raise ValueError(
            f"Gemini hit the output limit before finishing {what} - raise the "
            f"token cap or lower THINKING_BUDGET."
        )
    raise ValueError(f"Gemini returned no usable JSON for {what} (finish reason: {finish}).")


async def generate_book_meta(client: genai.Client, first_chunk: Chunk, topic: str) -> BookMeta:
    """Infer bibliographic metadata from the opening pages.

    Unlike a chunk, this cannot be skipped - there is no book row without a
    title - so failures raise instead of returning None. They are translated
    into a plain sentence first: an un-caught transport error would otherwise
    reach the client as a bare connector traceback.
    """
    try:
        response = await client.aio.models.generate_content(
            model=settings.ingestion_model,
            contents=(
                f"This is the opening of a non-fiction book in the '{topic}' category. "
                f"Identify its metadata.\n\n<opening>\n{first_chunk.text[:6000]}\n</opening>"
            ),
            config=_config(BookMeta, output_tokens=2_000),
        )
    except _TRANSPORT_ERRORS as exc:
        raise RuntimeError(
            f"Could not reach the Gemini API ({type(exc).__name__}: {exc}). "
            f"Check network access and GEMINI_API_KEY."
        ) from exc
    except genai_errors.APIError as exc:
        raise RuntimeError(
            f"Gemini rejected the metadata request ({exc.code}): {exc.message}"
        ) from exc

    return _parsed(response, BookMeta, "book metadata")


async def generate_chunk_cards(
    client: genai.Client,
    chunk: Chunk,
    topic: str,
    semaphore: asyncio.Semaphore,
) -> ChunkCards | None:
    """Generate one chunk's cards. Returns None if the chunk fails."""
    async with semaphore:
        try:
            response = await client.aio.models.generate_content(
                model=settings.ingestion_model,
                contents=_USER_TEMPLATE.format(
                    topic=topic, label=chunk.label, text=chunk.text
                ),
                # 16k leaves room for an SVG-bearing response on top of five
                # cards; _config adds the thinking budget to this.
                config=_config(ChunkCards, output_tokens=16_000),
            )
            return _parsed(response, ChunkCards, f"chunk '{chunk.label}'")

        except _TRANSPORT_ERRORS as exc:
            # Connection reset / DNS / timeout mid-fan-out. One chunk short is
            # a thinner deck; the upload still succeeds.
            logger.warning(
                "Network error reaching Gemini for chunk '%s': %s: %s",
                chunk.label, type(exc).__name__, exc,
            )
        except genai_errors.ClientError as exc:
            # 429 is quota/rate limit - by far the most common here; other 4xx
            # means the request itself was malformed.
            logger.warning(
                "Gemini client error %s on chunk '%s': %s", exc.code, chunk.label, exc.message
            )
        except genai_errors.ServerError as exc:
            logger.warning(
                "Gemini server error %s on chunk '%s': %s", exc.code, chunk.label, exc.message
            )
        except Exception as exc:  # noqa: BLE001 - one bad chunk must not kill the upload
            logger.warning("Chunk '%s' failed: %s", chunk.label, exc)
        return None


# ---------------------------------------------------------------------------
# 5. Assembly
# ---------------------------------------------------------------------------

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(value: str, *, fallback: str = "book") -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = _SLUG_STRIP.sub("-", value.lower()).strip("-")
    return "-".join(slug.split("-")[:6]) or fallback


def unique_slug(db: Session, base: str) -> str:
    """Append -2, -3… until the slug is free."""
    slug, n = base, 2
    while db.get(Book, slug) is not None:
        slug = f"{base}-{n}"
        n += 1
    return slug


def enforce_ratio(
    core: list[CoreCard], sandboxes: list[SandboxCard], diagrams: list[DiagramCard]
) -> tuple[list[CoreCard], list[SandboxCard], list[DiagramCard]]:
    """Trim to an exact 60/20/20 mix.

    Solves for the largest total T where 0.6T <= len(core), 0.2T <= len(sandbox)
    and 0.2T <= len(diagram). If a kind came back empty - or exact trimming
    would discard more than half the generated cards - we keep everything and
    let the mix drift rather than throw away good content.
    """
    if not (core and sandboxes and diagrams):
        return core, sandboxes, diagrams

    total = min(len(core) / 0.6, len(sandboxes) / 0.2, len(diagrams) / 0.2)
    keep_core = int(total * 0.6)
    keep_side = int(total * 0.2)

    generated = len(core) + len(sandboxes) + len(diagrams)
    if keep_core + 2 * keep_side < generated * 0.5:
        return core, sandboxes, diagrams

    return core[:keep_core], sandboxes[:keep_side], diagrams[:keep_side]


def persist_book(
    db: Session,
    *,
    meta: BookMeta,
    topic: str,
    core: list[CoreCard],
    sandboxes: list[SandboxCard],
    diagrams: list[DiagramCard],
) -> Book:
    """Write the Book and its Flashcards. Caller owns the commit."""
    slug = unique_slug(db, slugify(meta.title))

    book = Book(
        id=slug,
        title=meta.title.strip() or "Untitled",
        author=meta.author.strip(),
        description=meta.description.strip(),
        topic=topic,
        cover_color=meta.cover_color if re.fullmatch(r"#[0-9a-fA-F]{6}", meta.cover_color or "") else "#8B5FBF",
        glyph=(meta.glyph or "📘")[:8],
        minutes=max(1, min(60, meta.minutes or 8)),
        related_topics=[t.strip() for t in meta.related_topics[:5] if t.strip()],
        similar_book_ids=[],
        source="ingested",
        created_at=now_ms(),
    )
    db.add(book)

    position = 0

    for card in core:
        position += 1
        db.add(
            Flashcard(
                id=f"{slug}-{position}",
                book_id=slug,
                kind="core",
                position=position,
                rule_or_chapter=card.rule_or_chapter.strip()[:120],
                title=card.title.strip(),
                body=card.body.strip(),
                topic=(card.topic or topic).strip(),
                zeigarnik_cliffhanger=card.zeigarnik_cliffhanger.strip(),
                unlock_text=card.unlock_text.strip(),
            )
        )

    for card in sandboxes:
        try:
            formula = validate_formula(card.formula, card.slider)
        except ValueError as exc:
            # A sandbox without trustworthy math is worse than no sandbox.
            logger.warning("Dropping sandbox '%s': %s", card.title, exc)
            continue
        position += 1
        db.add(
            Flashcard(
                id=f"{slug}-{position}",
                book_id=slug,
                kind="sandbox",
                position=position,
                title=card.title.strip(),
                body=card.prompt.strip(),
                topic=(card.topic or topic).strip(),
                interactive_type="slider",
                interactive_data={
                    # interactive_data is a raw JSON column returned as-is by
                    # CardOut (no CamelModel involved) - key names here ARE
                    # the wire contract, so they're written camelCase by hand
                    # rather than via SliderSpec.model_dump(), which would
                    # emit snake_case (left_label/right_label) and silently
                    # break the frontend's `interactiveData.slider.leftLabel`.
                    "slider": {
                        "min": card.slider.min,
                        "max": card.slider.max,
                        "step": card.slider.step,
                        "value": card.slider.value,
                        "unit": card.slider.unit,
                        "leftLabel": card.slider.left_label,
                        "rightLabel": card.slider.right_label,
                    },
                    "formula": formula,
                    "resultPrefix": card.result_prefix,
                    "resultSuffix": card.result_suffix,
                    "resultLabel": card.result_label,
                    "badBelow": card.bad_below,
                    "goodAbove": card.good_above,
                    "verdicts": {
                        "bad": card.verdict_bad.strip(),
                        "neutral": card.verdict_neutral.strip(),
                        "good": card.verdict_good.strip(),
                    },
                },
            )
        )

    for card in diagrams:
        svg = sanitize_svg(card.svg)
        if not svg:
            logger.warning("Dropping diagram '%s': SVG failed sanitisation.", card.title)
            continue
        position += 1
        db.add(
            Flashcard(
                id=f"{slug}-{position}",
                book_id=slug,
                kind="diagram",
                position=position,
                title=card.title.strip(),
                topic=(card.topic or topic).strip(),
                caption=card.caption.strip(),
                insight=card.insight.strip(),
                diagram_svg=svg,
            )
        )

    db.flush()
    return book


async def process_book_pdf(file_path: str, topic: str, db: Session) -> Book:
    """Full pipeline: PDF ➜ chunks ➜ Gemini ➜ validated cards ➜ database.

    Args:
        file_path: Path to a readable PDF on local disk.
        topic:     Category the uploader assigned (e.g. "Personal Development").
        db:        Session to write into. The caller commits.

    Returns:
        The persisted :class:`Book`, with ``.cards`` populated.

    Raises:
        ValueError: unreadable PDF, or the model produced nothing usable.
    """
    chunks = extract_chunks(file_path)
    logger.info("Extracted %d chunk(s) from %s", len(chunks), file_path)

    client = _client()
    semaphore = asyncio.Semaphore(settings.llm_concurrency)

    # Metadata and card generation are independent - run them together.
    from typing import cast
    meta_task = generate_book_meta(client, chunks[0], topic)
    card_tasks = [generate_chunk_cards(client, c, topic, semaphore) for c in chunks]
    
    _gathered = await asyncio.gather(meta_task, *card_tasks)
    meta = cast(BookMeta, _gathered[0])
    results = cast(list[ChunkCards | None], _gathered[1:])

    core: list[CoreCard] = []
    sandboxes: list[SandboxCard] = []
    diagrams: list[DiagramCard] = []

    for result in results:
        if result is None:
            continue
        core.extend(result.core)
        sandboxes.extend(result.sandboxes)
        diagrams.extend(result.diagrams)

    if not (core or sandboxes or diagrams):
        raise ValueError("The model returned no usable cards for this PDF.")

    core, sandboxes, diagrams = enforce_ratio(core, sandboxes, diagrams)
    logger.info("Generated %d core / %d sandbox / %d diagram", len(core), len(sandboxes), len(diagrams))

    return persist_book(
        db, meta=meta, topic=topic, core=core, sandboxes=sandboxes, diagrams=diagrams
    )


__all__ = [
    "BookMeta",
    "Chunk",
    "ChunkCards",
    "CoreCard",
    "DiagramCard",
    "SandboxCard",
    "enforce_ratio",
    "extract_chunks",
    "process_book_pdf",
    "sanitize_svg",
    "slugify",
    "validate_formula",
]
