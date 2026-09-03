#!/usr/bin/env node
/* ============================================================
   export_seed.js - data.js  ->  backend/seed_data.json
   ------------------------------------------------------------
   `data.js` is the historical source of truth for the 25 curated
   books, their chapter cards, the three feed pools, the default
   stashes and the seed discussion threads. This script is the
   one-way bridge that lifts all of it into the shape
   `backend/seed.py` inserts into synapse.db.

   It is a BUILD-TIME tool, not a runtime dependency: run it once
   (or again whenever data.js changes) and commit the JSON.

     node backend/tools/export_seed.js

   Conversions it performs
   -----------------------
   * SEED_CARDS carry no bookId, so each is attached to the book
     named by its `source`. Sources that are not one of the 25
     books ("Huberman Lab", "Micro-sandbox", "Zen koan", "Visual
     model") become container books flagged source:"pool" so
     GET /api/books can keep returning exactly the 25 curated ones
     while card attribution (author/cover/source) stays correct.
   * Sandbox `compute()` JS closures become AST-safe arithmetic
     formulas (`v` is the slider value) plus static verdict text -
     the same interactive_data contract backend/ai_ingestion.py
     emits, so one renderer serves seeded and ingested cards.
   * d4's `chart` object is rendered to a static inline SVG, since
     Flashcard stores diagrams as SVG, not as chart configs.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_JS = path.join(ROOT, "data.js");
const OUT = path.join(ROOT, "backend", "seed_data.json");

/* ---------- load data.js in a sandbox ----------
   Top-level `const` in a script does not land on the global object,
   so we append an explicit export statement before evaluating.     */
const EXPORTS = [
  "TOPICS", "BOOKS", "FLASHCARDS", "CORE_CARDS", "SANDBOX_CARDS",
  "DIAGRAM_CARDS", "SEED_CARDS", "SEED_STASHES", "SEED_CARD_COMMENTS",
];
const src = fs.readFileSync(DATA_JS, "utf8") +
  `\n;globalThis.__SEED__ = { ${EXPORTS.join(", ")} };\n`;

const ctx = vm.createContext({ Date, Math, JSON, console });
vm.runInContext(src, ctx, { filename: "data.js" });
const D = ctx.__SEED__;

/* ---------- container books for non-book card sources ---------- */
const POOL_BOOKS = [
  { id: "huberman-lab", title: "Huberman Lab", author: "Andrew Huberman",
    glyph: "🎙", coverColor: "#e84393", topic: "Health", minutes: 6, year: 2021,
    relatedTopics: ["Health", "Focus", "Habits"], similarBookIds: [],
    description: "Protocol-level neuroscience for sleep, focus and energy, distilled into cards you can act on the same morning you read them." },
  { id: "psychology-of-money", title: "The Psychology of Money", author: "Morgan Housel",
    glyph: "\u{1F4B0}", coverColor: "#00b894", topic: "Money", minutes: 9, year: 2020,
    relatedTopics: ["Money", "Psychology", "Personal Development"], similarBookIds: ["naval-almanack", "compound-effect"],
    description: "Nineteen short stories on the soft skills of money. Housel's argument is that doing well with money has almost nothing to do with how smart you are and almost everything to do with how you behave." },
  { id: "micro-sandbox", title: "Micro-sandbox", author: "Synapse",
    glyph: "🎲", coverColor: "#00b894", topic: "Productivity", minutes: 3, year: null,
    relatedTopics: ["Money", "Habits"], similarBookIds: [],
    description: "Tiny interactive models. Drag one input and watch an idea you thought you understood argue back." },
  { id: "zen-koan", title: "Zen koan", author: "Synapse",
    glyph: "🌀", coverColor: "#6c5ce7", topic: "Philosophy", minutes: 3, year: null,
    relatedTopics: ["Productivity", "Money"], similarBookIds: [],
    description: "Branching thought experiments. There is no correct path - only the version of you waiting at the end of the one you pick." },
  { id: "visual-model", title: "Visual model", author: "Synapse",
    glyph: "📊", coverColor: "#ff3d7f", topic: "Psychology", minutes: 2, year: null,
    relatedTopics: ["Money", "Productivity"], similarBookIds: [],
    description: "One diagram, one idea. The shape of the thing is usually the argument." },
];

const bookByTitle = new Map(D.BOOKS.map(b => [b.title, b]));
const POOL_BY_SOURCE = {
  "The Psychology of Money": "psychology-of-money",
  "Huberman Lab": "huberman-lab",
  "Micro-sandbox": "micro-sandbox",
  "Zen koan": "zen-koan",
  "Visual model": "visual-model",
};

function resolveBookId(card) {
  const byTitle = bookByTitle.get(card.source);
  if (byTitle) return byTitle.id;
  const pool = POOL_BY_SOURCE[card.source];
  if (pool) return pool;
  throw new Error(`No book for card ${card.id} (source: ${card.source})`);
}

/* ---------- books ---------- */
const books = [];
for (const b of D.BOOKS) {
  books.push({
    id: b.id, title: b.title, author: b.author || "", description: b.description || "",
    topic: b.topic || "", cover_color: b.coverColor || "#8B5FBF", cover_image: b.coverImage || null,
    glyph: b.glyph || "📘", minutes: b.minutes || 8, year: b.year ?? null,
    related_topics: b.relatedTopics || [], similar_book_ids: b.similarBookIds || [],
    source: "seed",
  });
}
for (const b of POOL_BOOKS) {
  books.push({
    id: b.id, title: b.title, author: b.author, description: b.description,
    topic: b.topic, cover_color: b.coverColor, cover_image: null, glyph: b.glyph,
    minutes: b.minutes, year: b.year, related_topics: b.relatedTopics,
    similar_book_ids: b.similarBookIds, source: "pool",
  });
}

/* ---------- flashcards: book chapter cards ---------- */
const cards = [];
const nextPos = new Map();           // bookId -> next free position
function position(bookId) {
  const p = (nextPos.get(bookId) || 0) + 1;
  nextPos.set(bookId, p);
  return p;
}

const topicOfBook = new Map(D.BOOKS.map(b => [b.id, b.topic]));
for (const c of D.FLASHCARDS) {
  cards.push({
    id: c.id, book_id: c.bookId, kind: "core", position: position(c.bookId),
    rule_or_chapter: c.ruleNumberOrChapter || "", title: c.title, body: c.body || "",
    topic: topicOfBook.get(c.bookId) || "",
    zeigarnik_cliffhanger: c.zeigarnikCliffhanger || "",
    unlock_text: "",
    interactive_type: c.interactiveType || null, interactive_data: null,
    diagram_svg: null, caption: "", insight: "",
    image_url: c.imageUrl || null, likes: 0, saves: 0,
  });
}

/* ---------- flashcards: feed pool - core ---------- */
for (const c of D.CORE_CARDS) {
  const bookId = resolveBookId(c);
  cards.push({
    id: c.id, book_id: bookId, kind: "core", position: position(bookId),
    rule_or_chapter: c.type || "", title: c.title, body: c.body || "",
    topic: c.topic || "",
    zeigarnik_cliffhanger: c.cliffhanger || "",
    unlock_text: c.unlock || "",
    interactive_type: null, interactive_data: null,
    diagram_svg: null, caption: "", insight: "",
    image_url: null, likes: c.likes || 0, saves: c.saves || 0,
  });
}

/* ---------- flashcards: feed pool - sandbox ----------
   compute() -> { formula, verdicts, thresholds }. The formulas below are
   transcriptions of the JS closures in data.js §8, kept in the AST subset
   backend/ai_ingestion.validate_formula accepts (v, arithmetic, and the
   min/max/abs/round/pow/sqrt/log/exp/floor/ceil allowlist).             */
const SANDBOX_MATH = {
  // ev = 250 * (v/100) - 100   - $250 upside on a $100 stake at v% odds
  s1: {
    formula: "250 * (v / 100) - 100",
    resultPrefix: "$", resultSuffix: "", resultLabel: "expected value per play",
    // signed metric: app.js renders "+$25" / "-$30" rather than "$-30"
    showPlus: true,
    badBelow: -8, goodAbove: 8,
    verdicts: {
      bad: "Walk away - below 40% odds, courage is just a slow leak.",
      neutral: "A near coin-toss. The edge has vanished - the koan is knowing when not to play.",
      good: "Take it. Repeated enough times, the math pays you.",
    },
  },
  // mult = (1 + v/100) ^ 365   - compounding a daily % gain over a year
  s2: {
    formula: "pow(1 + v / 100, 365)",
    resultPrefix: "", resultSuffix: "×", resultLabel: "you, one year later",
    badBelow: 1.4, goodAbove: 3,
    verdicts: {
      bad: "Barely moving. Consistency this low is almost indistinguishable from standing still.",
      neutral: "Real, but slow. The gap between 1% and 2% a day is an entire different person.",
      good: "Compounding is quietly violent - a fraction of a percent a day becomes multiples of you a year.",
    },
  },
};

for (const c of D.SANDBOX_CARDS) {
  const bookId = resolveBookId(c);
  let interactiveType, interactiveData;

  if (c.mode === "slider") {
    const m = SANDBOX_MATH[c.id];
    if (!m) throw new Error(`No formula transcription for sandbox ${c.id}`);
    interactiveType = "slider";
    interactiveData = {
      // camelCase by hand: interactive_data is a raw JSON column returned
      // verbatim by CardOut, so these key names ARE the wire contract.
      slider: {
        min: c.slider.min, max: c.slider.max, step: c.slider.step,
        value: c.slider.value, unit: c.slider.unit || "",
        leftLabel: c.slider.leftLabel || "", rightLabel: c.slider.rightLabel || "",
      },
      formula: m.formula,
      resultPrefix: m.resultPrefix, resultSuffix: m.resultSuffix,
      resultLabel: m.resultLabel, badBelow: m.badBelow, goodAbove: m.goodAbove,
      showPlus: !!m.showPlus,
      verdicts: m.verdicts,
    };
  } else {
    interactiveType = "choice";
    interactiveData = { start: c.start, nodes: c.nodes };
  }

  cards.push({
    id: c.id, book_id: bookId, kind: "sandbox", position: position(bookId),
    rule_or_chapter: c.type || "", title: c.title, body: c.prompt || "",
    topic: c.topic || "", zeigarnik_cliffhanger: "", unlock_text: "",
    interactive_type: interactiveType, interactive_data: interactiveData,
    diagram_svg: null, caption: "", insight: "",
    image_url: null, likes: c.likes || 0, saves: c.saves || 0,
  });
}

/* ---------- flashcards: feed pool - diagram ----------
   d4 ships a `chart` config rather than markup; Flashcard stores diagrams
   as SVG, so the bars are rendered here once, statically.               */
function barChartSVG(chart) {
  const rows = chart.data;
  const unit = chart.unit || "";
  const max = Math.max(...rows.map(r => r.value)) || 1;
  const W = 320, barH = 26, gap = 34, top = 26, labelW = 8;
  const H = top + rows.length * (barH + gap);
  const bars = rows.map((r, i) => {
    const y = top + i * (barH + gap);
    const w = Math.round((r.value / max) * (W - 40));
    const fill = i === 0 ? "#e84393" : "#7b2ff7";
    return `<text class="bl" x="${labelW}" y="${y - 6}">${r.label}</text>` +
      `<rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${fill}" opacity="${i === 0 ? ".92" : ".38"}"/>` +
      `<text class="bv" x="${labelW + w + 8}" y="${y + 18}">${r.value}${unit}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="dgm">` +
    `<style>.bl{fill:var(--text-soft);font:700 11px Inter,system-ui,sans-serif}` +
    `.bv{fill:var(--text);font:800 12px Inter,system-ui,sans-serif}</style>` +
    bars + `</svg>`;
}

for (const c of D.DIAGRAM_CARDS) {
  const bookId = resolveBookId(c);
  const svg = c.svg ? c.svg.replace(/\s+/g, " ").trim() : barChartSVG(c.chart);
  cards.push({
    id: c.id, book_id: bookId, kind: "diagram", position: position(bookId),
    rule_or_chapter: c.type || "", title: c.title, body: "",
    topic: c.topic || "", zeigarnik_cliffhanger: "", unlock_text: "",
    interactive_type: null, interactive_data: null,
    diagram_svg: svg, caption: c.caption || "", insight: c.insight || "",
    image_url: null, likes: c.likes || 0, saves: c.saves || 0,
  });
}

/* ---------- stashes ----------
   createdAt in data.js is `Date.now() - N days`, i.e. relative to whenever
   the file was loaded. Export the OFFSET instead of the absolute stamp so
   the seeder can anchor it to the moment the database is first created.  */
const NOW = Date.now();
const stashes = D.SEED_STASHES.map(s => ({
  id: s.id, title: s.title, description: s.description || "",
  emoji: s.ico || "📚", color: s.color || "#7b2ff7",
  created_days_ago: Math.round((NOW - s.createdAt) / 86400000),
  card_ids: s.cardIds || [],
}));

/* ---------- comments ---------- */
const CREATOR_NAMES = {
  "cr-utsa": "Utsa Mukherjee", "cr-priya": "Priya Nair", "cr-sam": "Sam Okafor",
  "cr-daniel": "Daniel Cho", "cr-lena": "Lena Olsen", "cr-aiko": "Aiko Tanaka",
  "cr-marcus": "Marcus Diallo", "cr-theo": "Theo Brandt",
};
const comments = [];
for (const [cardId, thread] of Object.entries(D.SEED_CARD_COMMENTS)) {
  for (const c of thread) {
    comments.push({
      id: c.id, card_id: cardId,
      author: CREATOR_NAMES[c.author] || c.author,
      avatar: c.avatar || "?", color: c.color || "#7b2ff7",
      text: c.text, likes: c.likes || 0, parent_id: c.parentId || null,
      created_days_ago: Math.round((NOW - c.ts) / 86400000),
    });
  }
}

/* ---------- sanity checks ---------- */
const cardIds = new Set(cards.map(c => c.id));
const bookIds = new Set(books.map(b => b.id));
for (const c of cards) if (!bookIds.has(c.book_id)) throw new Error(`orphan card ${c.id}`);
for (const s of stashes) {
  const missing = s.card_ids.filter(id => !cardIds.has(id));
  if (missing.length) throw new Error(`stash ${s.id} references unknown cards: ${missing}`);
}
for (const c of comments) if (!cardIds.has(c.card_id)) throw new Error(`comment ${c.id} on unknown card ${c.card_id}`);
if (cardIds.size !== cards.length) throw new Error("duplicate card ids");

const payload = {
  generated_from: "data.js",
  curated_book_count: D.BOOKS.length,
  books, cards, stashes, comments,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
console.log(
  `wrote ${path.relative(ROOT, OUT)}: ` +
  `${D.BOOKS.length} curated books (+${POOL_BOOKS.length} pool), ` +
  `${cards.length} cards ` +
  `(core ${cards.filter(c => c.kind === "core").length}, ` +
  `sandbox ${cards.filter(c => c.kind === "sandbox").length}, ` +
  `diagram ${cards.filter(c => c.kind === "diagram").length}), ` +
  `${stashes.length} stashes, ${comments.length} comments`
);
