/* ============================================================
   db.js - Offline SRS store + SuperMemo SM-2 engine
            + offline-first cache for public learning content
   ------------------------------------------------------------
   Exposes two globals:
     window.SRS    - spaced-repetition scheduling (unchanged API)
     window.Cache  - offline mirror of the server catalogue

   ------------------------------------------------------------
   PRIVACY BOUNDARY - read before adding a store
   ------------------------------------------------------------
   IndexedDB here holds PUBLIC LEARNING CONTENT ONLY:

       cards       SM-2 schedules (card id + interval maths)
       books       book metadata from GET /api/books
       flashcards  card content from GET /api/feed & /api/books/:id
       stashes     collections from GET /api/stashes
       comments    threads from GET /api/cards/:id/comments

   The following MUST NEVER be written to IndexedDB:
     • JWTs, refresh tokens, API keys, session identifiers
     • passwords or password hashes
     • email addresses, real names, avatars-as-personal-data,
       onboarding answers, or any other profile record

   IndexedDB is origin-scoped, unencrypted, readable by any script
   that reaches this origin, and survives long after sign-out -
   which makes it a fine place for a book cover and a terrible one
   for a bearer token. Auth state lives in memory for the session
   and is sent only in the Authorization header (see app.js
   getApiToken); nothing in this file reads or writes it.

   A cached comment carries only what the server already publishes
   to every reader of that card: a display name, initials and a
   colour. No user ids, no contact details.
   ------------------------------------------------------------
   Storage (IndexedDB, one record per card in `cards`):
     { id, interval, repetitions, easeFactor, nextReviewDate,
       lastQuality, lastReviewed }

   Design notes
   • All SRS records are mirrored in an in-memory Map (`cache`) so
     the rest of the app can read state SYNCHRONOUSLY during render.
     Writes update the cache immediately, then persist async.
   • `SRS.ready` resolves once the DB is open and the cache is warm.
   • If IndexedDB is unavailable, it degrades to memory-only and
     `SRS.ready` still resolves - the app keeps working for the
     session, just without offline persistence.
   ============================================================ */
(function () {
  "use strict";

  const DB_NAME = "synapse_cache";
  const VERSION = 2;
  const DAY     = 86400000; // ms in a day

  // Store 1 is the SRS schedule; 2–5 are the content mirror.
  const STORE   = "cards";        // SM-2 state, keyPath "id"
  const CONTENT_STORES = ["books", "flashcards", "stashes", "comments"];
  const ALL_STORES = [STORE].concat(CONTENT_STORES);

  const cache = new Map();   // card id -> SM-2 record
  let db = null;
  let memoryOnly = false;

  /* ---------- IndexedDB plumbing ---------- */

  // v1 used DB_NAME "synapse_srs" with a single `cards` store. The rename
  // to "synapse_cache" means this opens a *fresh* database rather than
  // upgrading in place, so v1 schedules are migrated across on first open.
  const LEGACY_DB_NAME = "synapse_srs";

  function openDB() {
    return new Promise((resolve) => {
      if (!("indexedDB" in window)) { memoryOnly = true; return resolve(); }
      let req;
      try { req = indexedDB.open(DB_NAME, VERSION); }
      catch { memoryOnly = true; return resolve(); }

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        // Idempotent: safe whether this is a create or a v1 -> v2 upgrade.
        ALL_STORES.forEach((name) => {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "id" });
        });
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        // Don't hold the boot on a failed read; SRS just starts cold.
        db.onversionchange = () => { try { db.close(); } catch {} db = null; };
        loadAll().then(migrateLegacy).then(resolve, resolve);
      };
      req.onerror   = () => { memoryOnly = true; resolve(); };
      req.onblocked = () => { memoryOnly = true; resolve(); };
    });
  }

  function loadAll() {
    return new Promise((res) => {
      if (!db) return res();
      try {
        const rq = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        rq.onsuccess = () => { (rq.result || []).forEach(r => cache.set(r.id, r)); res(); };
        rq.onerror = () => res();
      } catch { res(); }
    });
  }

  // One-time lift of SM-2 schedules out of the v1 database. Content stores are
  // not migrated - they refill from the API on the next online boot.
  function migrateLegacy() {
    return new Promise((res) => {
      if (!db || cache.size) return res();          // already have state, skip
      let req;
      try { req = indexedDB.open(LEGACY_DB_NAME); }
      catch { return res(); }
      req.onerror = () => res();
      req.onsuccess = (e) => {
        const old = e.target.result;
        try {
          if (!old.objectStoreNames.contains(STORE)) { old.close(); return res(); }
          const rq = old.transaction(STORE, "readonly").objectStore(STORE).getAll();
          rq.onerror = () => { old.close(); res(); };
          rq.onsuccess = () => {
            (rq.result || []).forEach((r) => { if (r && r.id) { cache.set(r.id, r); persist(r); } });
            old.close();
            res();
          };
        } catch { try { old.close(); } catch {} res(); }
      };
    });
  }

  function persist(rec) {
    if (!db) return;
    try { db.transaction(STORE, "readwrite").objectStore(STORE).put(rec); } catch {}
  }

  /* ---------- generic content-store helpers ----------
     Every write is a bulk `put` in one transaction: the cache is a mirror of
     what the server just returned, so a partial write is worse than none.
     All of them resolve (never reject) - a cache miss must degrade to a
     network read, not to a broken render.                                  */

  function putAll(storeName, records) {
    return new Promise((res) => {
      if (!db || !Array.isArray(records) || !records.length) return res(false);
      try {
        const tx = db.transaction(storeName, "readwrite");
        const os = tx.objectStore(storeName);
        records.forEach((r) => { if (r && r.id != null) os.put(r); });
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
        tx.onabort = () => res(false);
      } catch { res(false); }
    });
  }

  function getAllFrom(storeName) {
    return new Promise((res) => {
      if (!db) return res([]);
      try {
        const rq = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        rq.onsuccess = () => res(rq.result || []);
        rq.onerror = () => res([]);
      } catch { res([]); }
    });
  }

  function getOneFrom(storeName, id) {
    return new Promise((res) => {
      if (!db || id == null) return res(null);
      try {
        const rq = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => res(null);
      } catch { res(null); }
    });
  }

  function clearStore(storeName) {
    return new Promise((res) => {
      if (!db) return res(false);
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      } catch { res(false); }
    });
  }

  /* ---------- SM-2 core (pure, testable) ----------
     Given the previous card state and a recall quality (0–5),
     returns the next state. Classic SuperMemo 2:
       q >= 3  → correct:  interval ladder 1 → 6 → round(I * EF)
       q <  3  → lapse:    repetitions reset, interval back to 1 day
       EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)), floored at 1.3
  ------------------------------------------------------------ */
  function clampQ(q) { q = Math.round(Number(q)); return q < 0 ? 0 : q > 5 ? 5 : q; }

  function schedule(prev, quality) {
    const q = clampQ(quality);
    let interval     = prev && prev.interval     != null ? prev.interval     : 0;
    let repetitions  = prev && prev.repetitions  != null ? prev.repetitions  : 0;
    let easeFactor   = prev && prev.easeFactor   != null ? prev.easeFactor   : 2.5;

    if (q >= 3) {
      if      (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else                        interval = Math.round(interval * easeFactor);
      repetitions += 1;
    } else {
      repetitions = 0;
      interval = 1; // relearn tomorrow → quietly re-injects at +24h
    }

    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;
    easeFactor = Math.round(easeFactor * 100) / 100;

    const now = Date.now();
    return {
      interval,
      repetitions,
      easeFactor,
      nextReviewDate: now + interval * DAY,
      lastQuality: q,
      lastReviewed: now,
    };
  }

  /* ---------- Public API: SRS ---------- */

  // Simplified button set → SM-2 quality.
  //   Hard = you struggled  → q2 (lapse, back in ~24h)
  //   Good = recalled it    → q4
  //   Easy = effortless     → q5
  // (Call review(id, 0–5) directly if you want the full grade scale,
  //  e.g. an extra "Again" button at q0/q1.)
  const QUALITY = { AGAIN: 1, HARD: 2, GOOD: 4, EASY: 5 };
  const BUTTONS = [
    { key: "hard", label: "Hard", q: 2 },
    { key: "good", label: "Good", q: 4 },
    { key: "easy", label: "Easy", q: 5 },
  ];

  function get(id)  { return cache.get(id); }
  function all()    { return [...cache.values()]; }

  function isDue(id, now) {
    const s = cache.get(id);
    if (!s) return true;                 // never studied → treat as due (new)
    return s.nextReviewDate <= (now || Date.now());
  }

  // What interval (in days) would this quality produce right now?
  // Powers the Anki-style interval hint under each button.
  function preview(id, quality) { return schedule(cache.get(id), quality).interval; }

  // Grade a card: compute next SM-2 state, cache + persist, return it.
  function review(id, quality) {
    const rec = schedule(cache.get(id), quality);
    rec.id = id;
    cache.set(id, rec);
    persist(rec);
    return rec;
  }

  // Adopt the server's SM-2 state for a card (POST /api/cards/review response,
  // or the `srs` block hanging off a feed item). Server state wins: it is the
  // one record that follows the account across devices.
  function hydrate(id, srs) {
    if (!id || !srs) return null;
    const rec = {
      id,
      interval: srs.interval != null ? srs.interval : 0,
      repetitions: srs.repetitions != null ? srs.repetitions : 0,
      easeFactor: srs.easeFactor != null ? srs.easeFactor : 2.5,
      nextReviewDate: srs.nextReviewDate != null ? srs.nextReviewDate : 0,
      lastQuality: srs.lastQuality != null ? srs.lastQuality : null,
      lastReviewed: srs.lastReviewed != null ? srs.lastReviewed : null,
    };
    cache.set(id, rec);
    persist(rec);
    return rec;
  }

  // Counts for the "due today" indicator.
  function counts(ids, now) {
    now = now || Date.now();
    let due = 0, fresh = 0, scheduled = 0;
    ids.forEach((id) => {
      const s = cache.get(id);
      if (!s) fresh++;
      else if (s.nextReviewDate <= now) due++;
      else scheduled++;
    });
    return { due, fresh, scheduled, total: ids.length };
  }

  function reset(id) {
    cache.delete(id);
    if (db) { try { db.transaction(STORE, "readwrite").objectStore(STORE).delete(id); } catch {} }
  }

  const ready = openDB();

  window.SRS = {
    ready,
    schedule, review, preview, get, all, isDue, counts, reset, hydrate,
    QUALITY, BUTTONS, DAY,
    get memoryOnly() { return memoryOnly; },
  };

  /* ============================================================
     window.Cache - offline mirror of the public catalogue
     ------------------------------------------------------------
     app.js writes through on every successful fetch and reads back
     when the network is gone. Records are stored exactly as the API
     returned them (camelCase), so a cached read and a live read are
     the same shape and the renderers can't tell them apart.

     Comments are keyed by comment id, not card id, so a thread is
     read back with getCachedComments(cardId), which filters on the
     record's own cardId field.
     ============================================================ */
  function getAllCachedComments() {
    return getAllFrom("comments").then(rows =>
      rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }

  window.Cache = {
    ready,
    get available() { return !!db; },

    /* --- books --- */
    cacheBooks(books)   { return putAll("books", books); },
    getCachedBooks()    { return getAllFrom("books"); },
    getCachedBook(id)   { return getOneFrom("books", id); },

    /* --- flashcards --- */
    cacheFlashcards(cards) { return putAll("flashcards", cards); },
    getCachedFlashcards()  { return getAllFrom("flashcards"); },
    getCachedFlashcard(id) { return getOneFrom("flashcards", id); },

    /* --- stashes ---
       GET /api/stashes returns the caller's COMPLETE set, so the mirror is
       replaced rather than merged: a stash deleted (or hidden by a fork)
       server-side has to disappear locally too, which an upsert can't do.
       cacheStashes() keeps upsert semantics for single-record writes. */
    cacheStashes(stashes)   { return putAll("stashes", stashes); },
    replaceStashes(stashes) {
      return clearStore("stashes").then(() => putAll("stashes", stashes));
    },
    getCachedStashes()      { return getAllFrom("stashes"); },
    getCachedStash(id)      { return getOneFrom("stashes", id); },

    /* --- comments ---
       cacheComments(cardId, threads) flattens a nested thread response into
       one record per comment so a reply can be updated without rewriting its
       parent. Each record keeps its cardId for the filtered read back. */
    cacheComments(cardId, threads) {
      const flat = [];
      const walk = (list, parentId) => {
        (list || []).forEach((c) => {
          if (!c || !c.id) return;
          flat.push({
            id: c.id,
            cardId: c.cardId || cardId,
            author: c.author, avatar: c.avatar, color: c.color,
            text: c.text, likes: c.likes,
            parentId: c.parentId != null ? c.parentId : (parentId || null),
            createdAt: c.createdAt,
          });
          walk(c.replies, c.id);
        });
      };
      walk(threads, null);
      return putAll("comments", flat);
    },

    // Returns a flat, chronologically sorted list for one card. app.js
    // re-nests it; keeping the store flat means one put per new comment.
    getCachedComments(cardId) {
      return getAllCachedComments().then(rows =>
        rows.filter(r => r.cardId === cardId));
    },

    // Whole store in one read, chronological. app.js groups it by card at
    // boot so card footers can show comment counts synchronously.
    getAllCachedComments,

    // Drop the content mirror (SM-2 schedules are kept - they're the user's
    // own study progress, not a copy of anything the server would resend).
    clearContent() { return Promise.all(CONTENT_STORES.map(clearStore)); },
  };
})();
