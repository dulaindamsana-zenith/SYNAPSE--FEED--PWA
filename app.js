/* ============================================================
   Synapse - Variable Reward Engine :: app.js  (vanilla SPA)
   ============================================================ */
(function () {
  "use strict";

  const LS = {
    saved: "ds_saved", liked: "ds_liked", theme: "ds_theme", custom: "ds_custom", read: "ds_read_today",
    focus: "ds_focus", user: "ds_user", accounts: "ds_accounts", dailyFeed: "ds_daily_feed",
    following: "ds_following", notifications: "ds_notifications", drafts: "app_studio_drafts",
    customStashes: "ds_custom_stashes", cardComments: "ds_card_comments",
    ingested: "ds_ingested",
  };

  const state = {
    saved:  load(LS.saved, []),
    liked:  load(LS.liked, []),
    custom: load(LS.custom, []),
    read:   load(LS.read, []),
    following: load(LS.following, DEFAULT_FOLLOWING.slice()),
    notifications: load(LS.notifications, NOTIFICATIONS_SEED.map(n => ({ ...n, read: false }))),
    drafts: load(LS.drafts, []),
    filter: "All",
    query:  "",
  };

  function load(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; } catch { return fb; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

  // Every card the app knows about, de-duped by id and first-writer-wins:
  // user drafts, then the feed pools, then the book catalogue. FLASHCARDS is
  // included so a stash or a reader session can resolve a book card ("c1"
  // and "atomic-habits-2" both come back), which the feed-only lookup could
  // not do.
  function allCards() {
    const seen = new Set(), out = [];
    [state.custom, SEED_CARDS, FLASHCARDS].forEach(list => {
      (list || []).forEach(c => { if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } });
    });
    return out;
  }
  function cardById(id) { return allCards().find(c => c.id === id); }

  // Books/cards produced by AI PDF ingestion (backend/ai_ingestion.py) are
  // merged straight into the live BOOKS/FLASHCARDS arrays from data.js -
  // `const` only blocks reassignment, not mutation - so bookById()/
  // cardsForBook() pick them up with zero changes. Restored here on every
  // boot so an ingested book survives a reload.
  (function restoreIngestedBooks() {
    const stored = load(LS.ingested, null);
    if (!stored) return;
    (stored.books || []).forEach(b => { if (!BOOKS.some(x => x.id === b.id)) BOOKS.push(b); });
    (stored.cards || []).forEach(c => { if (!FLASHCARDS.some(x => x.id === c.id)) FLASHCARDS.push(c); });
  })();

  /* ============================================================
     USER / AUTH / ONBOARDING STATE
     Demo-only local auth - accounts + profile persist in
     localStorage so guest -> freemium/pro progress survives reloads.
     ============================================================ */
  let user = loadUser();
  function loadUser() {
    const u = load(LS.user, null);
    if (!u) return createGuestUser();
    const fresh = createGuestUser();
    return { ...fresh, ...u, profile: { ...fresh.profile, ...(u.profile || {}) } };
  }
  function saveUser() {
    save(LS.user, user);
    if (user.profile && user.profile.email) {
      const accounts = loadAccounts();
      if (accounts[user.profile.email]) {
        accounts[user.profile.email].userSnapshot = user;
        saveAccounts(accounts);
      }
    }
    refreshGuestChrome();
  }
  function loadAccounts() { return load(LS.accounts, {}); }
  function saveAccounts(a) { save(LS.accounts, a); }

  function isGuest()    { return !user.isAuthenticated; }
  function isFreemium() { return user.tier === "freemium"; }
  function isPro()      { return user.tier === "pro"; }

  function refreshGuestChrome() {
    document.body.classList.toggle("guest-mode", isGuest());
    document.body.classList.toggle("free-mode", isFreemium());
    document.querySelectorAll('[data-route="topics"]').forEach(n => n.classList.toggle("locked-nav", isGuest()));

    const brand = document.getElementById("brandLink");
    if (brand) brand.setAttribute("href", isGuest() ? "#/" : "#/home");

    const bar = document.getElementById("stickyCta");
    if (!bar) return;
    const msg = document.getElementById("stickyCtaMsg");
    const signIn = document.getElementById("stickySignIn");
    const cta = document.getElementById("stickyGetStarted");
    if (isGuest()) {
      bar.hidden = false;
      msg.textContent = "Unlock the full library - 25 books, unlimited ideas";
      signIn.hidden = false;
      cta.textContent = "Get Started";
      cta.setAttribute("href", "#/onboarding");
      cta.onclick = null;
    } else if (isFreemium()) {
      bar.hidden = false;
      msg.textContent = `Freemium: ${FREEMIUM_DAILY_CAP} ideas/day. Go unlimited with Pro.`;
      signIn.hidden = true;
      cta.textContent = "Upgrade to Pro";
      cta.removeAttribute("href");
      cta.onclick = (e) => { e.preventDefault(); openTierUpsell(); };
    } else {
      bar.hidden = true;
    }

    refreshTopbarChrome();
  }

  function initials() {
    const f = (user.profile.firstName || "")[0] || "";
    const l = (user.profile.lastName || "")[0] || "";
    return (f + l).toUpperCase() || "YA";
  }

  function paintAvatar(el) {
    if (!el) return;
    if (user.profile.avatarUrl) el.innerHTML = `<img src="${esc(user.profile.avatarUrl)}" alt="" />`;
    else el.textContent = initials();
  }

  function refreshTopbarChrome() {
    paintAvatar(document.getElementById("avatarBtn"));
    paintAvatar(document.getElementById("ppAvatar"));
    setText("ppName", user.isAuthenticated ? [user.profile.firstName, user.profile.lastName].filter(Boolean).join(" ") || "Your name" : "Guest");
    setText("ppEmail", user.profile.email || "");

    const pro = document.getElementById("proPill");
    if (pro) {
      pro.classList.toggle("show", !isPro());
      pro.onclick = () => { isGuest() ? (location.hash = "#/onboarding") : openTierUpsell(); };
    }

    const badge = document.getElementById("bellBadge");
    if (badge) {
      const unread = state.notifications.filter(n => !n.read).length;
      badge.hidden = unread === 0;
      badge.textContent = unread > 9 ? "9+" : String(unread);
    }
  }

  const view = document.getElementById("view");
  const toastEl = document.getElementById("toast");

  /* ============================================================
     HAPTICS - fired on every sandbox interaction
     ============================================================ */
  function haptic(pattern) {
    if (navigator && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(pattern || [15, 30]); } catch {}
    }
  }

  /* ============================================================
     VARIABLE REWARD ENGINE
     Weighted draw (60/20/20) without replacement → each render
     produces a fresh, unpredictable order. Renormalizes weights
     as pools empty so nothing is ever starved.
     ============================================================ */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  function variableReward(list) {
    const preferred = matchedTopicSet();
    const pools = { core: [], sandbox: [], diagram: [] };
    list.forEach(c => (pools[c.kind] || pools.core).push(c));
    Object.keys(pools).forEach(k => {
      shuffle(pools[k]);
      if (preferred.size) pools[k].sort((a, b) => (preferred.has(b.topic) ? 1 : 0) - (preferred.has(a.topic) ? 1 : 0));
    });

    const out = [];
    const nonEmpty = () => Object.keys(pools).filter(k => pools[k].length);
    while (nonEmpty().length) {
      const avail = nonEmpty();
      const total = avail.reduce((s, k) => s + (REWARD_WEIGHTS[k] || 0.01), 0);
      let r = Math.random() * total, pick = avail[0];
      for (const k of avail) { r -= (REWARD_WEIGHTS[k] || 0.01); if (r <= 0) { pick = k; break; } }
      out.push(pools[pick].shift());
    }
    return out;
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  // Timers/observers owned by the current view - torn down on navigation.
  let teardown = [];
  function onTeardown(fn) { teardown.push(fn); }
  function runTeardown() { teardown.forEach(f => { try { f(); } catch {} }); teardown = []; }

  function currentRoute() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const path = hash.split("?")[0];
    const parts = path.split("/").filter(Boolean);   // ["book","atomic-habits"]
    return { path, hash, parts, base: "/" + (parts[0] || ""), param: parts[1] || null };
  }

  function router() {
    runTeardown();
    closeReader(true);
    const { base, param, hash } = currentRoute();

    // Signed-in users have no business on the pre-login marketing page -
    // bounce straight to the dashboard instead of rendering it at all.
    if (base === "/" && !isGuest()) { location.hash = "#/home"; return; }

    view.innerHTML = "";
    view.classList.remove("gated-view");
    document.body.classList.remove("landing", "onboarding-mode");
    refreshGuestChrome();

    switch (base) {
      case "/":           renderLanding(); break;
      case "/home":       renderHome(); break;
      case "/explore":    renderExplore(); break;
      case "/saved":      renderSaved(); break;
      case "/topics":     guardLibrary(() => param ? renderTopicDetail(param) : renderTopics()); break;
      case "/book":       renderBookDetail(param); break;
      case "/collection": guardLibrary(() => renderCollectionDetail(param)); break;
      case "/profile":    renderProfile(); break;
      case "/onboarding": renderOnboarding(hash); break;
      case "/stash":      renderStashView(param); break;
      default:            renderLanding();
    }

    syncNavActive(base === "/" ? "landing" : base.replace("/", ""));
    window.scrollTo(0, 0);
    document.body.classList.remove("nav-open");
    document.getElementById("scrim").hidden = true;
  }

  // Guest attempt to reach the main Library / Topics view: paint the real
  // (teaser) content, blur it, and surface the access barrier modal.
  function guardLibrary(renderFn) {
    renderFn();
    if (isGuest()) { view.classList.add("gated-view"); openGate("library"); }
  }

  /* ============================================================
     ACCESS GATE MODAL - reusable barrier for locked content
     ============================================================ */
  function openGateModal({ title, body, primaryLabel, onPrimary }) {
    document.getElementById("gateTitle").textContent = title;
    document.getElementById("gateBody").textContent = body;
    const btn = document.getElementById("gatePrimary");
    btn.textContent = primaryLabel;
    btn.onclick = onPrimary;
    document.getElementById("accessGate").hidden = false;
    document.body.classList.add("gate-open");
    haptic([15, 30]);
  }
  function closeGate() {
    document.getElementById("accessGate").hidden = true;
    document.body.classList.remove("gate-open");
  }
  function openGate(reason) {
    const copy = {
      library: { title: "The full library is members-only", body: "Create a free account to unlock all 25 books, every idea, and your personalised daily feed." },
      preview: { title: "You've used your 2 free ideas", body: "Get Started to unlock the rest of this book - and 24 more." },
    }[reason] || { title: "Unlock the full experience", body: "Create a free account to keep going." };
    openGateModal({
      title: copy.title, body: copy.body, primaryLabel: "Get Started",
      onPrimary: () => { closeGate(); location.hash = "#/onboarding"; },
    });
  }
  function openTierUpsell() {
    openGateModal({
      title: "Unlock unlimited ideas",
      body: `Freemium caps you at ${FREEMIUM_DAILY_CAP} ideas a day. Upgrade to Pro for an unlimited daily feed, the full 25-book library, and AI visuals on every card.`,
      primaryLabel: "Upgrade to Pro",
      onPrimary: () => { closeGate(); user.tier = "pro"; saveUser(); toast("You\'re on Pro now \uD83C\uDF89"); router(); },
    });
  }

  /* ============================================================
     FREEMIUM DAILY FEED CAP + GROWTH-AREA CALIBRATION
     ============================================================ */
  const FREEMIUM_DAILY_CAP = 5;
  let dailyFeed = loadDailyFeed();
  function loadDailyFeed() {
    const d = load(LS.dailyFeed, null);
    return (!d || d.date !== todayKey()) ? { date: todayKey(), seen: [] } : d;
  }
  function saveDailyFeed() { save(LS.dailyFeed, dailyFeed); }

  function capFeedForTier(list) {
    if (!isFreemium()) return { items: list, atCap: false };
    const seen = dailyFeed.seen;
    const kept = [];
    let count = seen.length;
    for (const c of list) {
      if (seen.includes(c.id)) { kept.push(c); continue; }
      if (count < FREEMIUM_DAILY_CAP) { kept.push(c); seen.push(c.id); count++; }
    }
    saveDailyFeed();
    return { items: kept, atCap: count >= FREEMIUM_DAILY_CAP };
  }

  // Bias the shuffle toward the reader's chosen growth areas without ever
  // hiding other topics - matched-topic cards simply tend to surface first.
  function matchedTopicSet() {
    if (!user.isAuthenticated || !user.profile.growthAreas.length) return new Set();
    const set = new Set();
    user.profile.growthAreas.forEach(id => {
      const g = GROWTH_AREAS.find(x => x.id === id);
      if (g) g.topics.forEach(t => set.add(t));
    });
    return set;
  }
  function syncNavActive(route) {
    document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === route));
  }

  /* ============================================================
     PROCEDURAL VISUALS
     Offline-safe SVG data URIs. `coverImage` / `imageUrl` on a
     record wins; otherwise art is generated deterministically
     from the record's id, so it never changes between renders.
     ============================================================ */
  function svgUri(svg) { return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg.replace(/\s+/g, " ").trim()); }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = (v) => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }
  // Rotate a hex colour's hue - gives each generated card visual its own tint.
  function hueShift(hex, deg) {
    let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    h = (h + deg / 360 + 1) % 1;
    const hk = (p, q, t) => { t = (t + 1) % 1; return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const to = (v) => Math.round(hk(p, q, v) * 255).toString(16).padStart(2, "0");
    return "#" + to(h + 1/3) + to(h) + to(h - 1/3);
  }

  function wrapWords(text, perLine, maxLines) {
    const words = String(text).split(" "), lines = []; let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length <= perLine) cur = (cur + " " + w).trim();
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, "…"); }
    return lines;
  }

  function bookCover(book) {
    if (book && book.coverImage && String(book.coverImage).trim() !== "") return book.coverImage;
    const c = book.coverColor, h = hash(book.id);
    const titleLines = wrapWords(book.title.toUpperCase(), 15, 4);
    const tSpans = titleLines.map((l, i) =>
      `<text x="22" y="${150 + i * 21}" fill="#fff" font-family="Inter,system-ui,sans-serif" font-size="16" font-weight="800">${esc(l)}</text>`).join("");
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${shade(c, 34)}"/><stop offset="1" stop-color="${shade(c, -46)}"/>
        </linearGradient>
      </defs>
      <rect width="240" height="320" fill="url(#g)"/>
      <circle cx="${40 + (h % 140)}" cy="${40 + (h % 60)}" r="${58 + (h % 40)}" fill="#fff" opacity=".09"/>
      <circle cx="${200 - (h % 90)}" cy="${290 - (h % 70)}" r="${44 + (h % 30)}" fill="#000" opacity=".12"/>
      <rect x="0" y="0" width="7" height="320" fill="#000" opacity=".25"/>
      <text x="22" y="78" font-size="42" opacity=".95">${esc(book.glyph || "📘")}</text>
      ${tSpans}
      <text x="22" y="${164 + titleLines.length * 21}" fill="#fff" opacity=".72"
            font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="600">${esc(book.author)}</text>
    </svg>`);
  }

  // Abstract "AI visual" slot for a flashcard.
  function cardVisual(card) {
    if (card.imageUrl) return card.imageUrl;
    const book = bookById(card.bookId) || { coverColor: "#7b2ff7" };
    const h = hash(card.id);
    // each card gets its own tint so a book's grid reads as a set, not a repeat
    const c = hueShift(book.coverColor, (h % 90) - 45);
    const a = shade(c, 40), b = shade(hueShift(c, 22), -62);
    let shapes = "";
    for (let i = 0; i < 6; i++) {
      const s = hash(card.id + i);
      shapes += `<circle cx="${(s % 640)}" cy="${(s >> 3) % 360}" r="${30 + (s % 110)}" fill="#fff" opacity="${(0.04 + (s % 7) / 100).toFixed(2)}"/>`;
    }
    const waveY = 200 + (h % 90);
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      ${shapes}
      <path d="M0 ${waveY} C160 ${waveY - 70} 320 ${waveY + 70} 640 ${waveY - 30} L640 360 L0 360 Z" fill="#000" opacity=".16"/>
      <path d="M0 ${waveY + 46} C180 ${waveY - 16} 380 ${waveY + 96} 640 ${waveY + 26} L640 360 L0 360 Z" fill="#fff" opacity=".07"/>
      <text x="34" y="${86 + (h % 40)}" font-size="72" opacity=".9">${esc(book.glyph || "💡")}</text>
    </svg>`);
  }

  /* ============================================================
     VIEWS
     ============================================================ */
  function renderHome() {
    if (isGuest()) { renderGuestHome(); return; }
    renderRecommendedTab(view);
  }

  // ---------- Tab 1: Daily Picks (editorial book list + promo banners) ----------
  function renderDailyPicksTab(host) {
    host.appendChild(el(`
      <section class="hero" style="margin-bottom:22px">
        <div class="blob"></div><div class="blob b2"></div>
        <h1>Today's picks, curated for you.</h1>
        <p>A hand-picked set of books and their highest-impact takeaways - new ones land every morning.</p>
      </section>`));

    const list = el(`<div class="daily-list"></div>`);
    host.appendChild(list);

    const picks = DAILY_PICKS_IDS.map(bookById).filter(Boolean);
    picks.forEach((b, i) => {
      const c = cardsForBook(b.id)[0];
      list.appendChild(el(`
        <article class="pick-row" data-book="${b.id}">
          <img src="${bookCover(b)}" alt="${esc(b.title)}" loading="lazy" />
          <div class="pick-info">
            <div class="pick-tags"><span class="pick-tag">${esc(b.topic)}</span><span class="pick-tag">${b.minutes} min</span></div>
            <div class="pick-title">${esc(b.title)}</div>
            <p class="pick-snapshot">${esc(c ? c.body.slice(0, 120) + "…" : b.description.slice(0, 120) + "…")}</p>
            <div class="pick-meta">${esc(b.author)} · ${cardsForBook(b.id).length} key ideas</div>
          </div>
        </article>`));
      if (i === 2) list.appendChild(promoBanner("sync"));
      if (i === 5) list.appendChild(promoBanner("retention"));
    });

    list.querySelectorAll(".pick-row").forEach(row => row.onclick = () => { location.hash = "#/book/" + row.dataset.book; });
  }

  function promoBanner(kind) {
    if (kind === "retention") {
      return el(`
        <div class="promo-banner alt">
          <div class="promo-copy">
            <span class="promo-badge">Spaced repetition</span>
            <h3>Never let a good idea fade</h3>
            <p>Every card you grade schedules its own comeback - right before you'd otherwise forget it. That's the SuperMemo SM-2 engine, quietly running in the background.</p>
          </div>
          <div class="promo-visual">🧠</div>
        </div>`);
    }
    return el(`
      <div class="promo-banner">
        <div class="promo-copy">
          <span class="promo-badge">Take it anywhere</span>
          <h3>Your key ideas, on every device</h3>
          <p>Everything you save syncs across desktop and mobile automatically, and your review schedule keeps working even offline - no connection required.</p>
        </div>
        <div class="promo-visual">📱</div>
      </div>`);
  }

  // ---------- Tab 2: Recommended (the variable-reward engine, calibrated) ----------
  function renderRecommendedTab(host) {
    const chips = el(`<div class="chips"></div>`);
    ["All", ...TOPICS.map(t => t.name)].forEach(t => {
      const c = el(`<button class="chip ${state.filter === t ? "active" : ""}">${t}</button>`);
      c.onclick = () => { state.filter = t; refreshFeed(); };
      chips.appendChild(c);
    });
    host.appendChild(chips);

    if (isFreemium()) {
      const used = Math.min(dailyFeed.seen.length, FREEMIUM_DAILY_CAP);
      const pct = Math.round((used / FREEMIUM_DAILY_CAP) * 100);
      const meter = el(`
        <div class="rec-meter ${used >= FREEMIUM_DAILY_CAP ? "capped" : ""}">
          <span class="rec-meter-label">${used}/${FREEMIUM_DAILY_CAP} free recommendations viewed today</span>
          <div class="rec-meter-bar"><div class="rec-meter-fill" style="width:${pct}%"></div></div>
          <button class="btn-primary rec-meter-cta" id="recUpgrade">Unlock unlimited</button>
        </div>`);
      host.appendChild(meter);
      meter.querySelector("#recUpgrade").onclick = () => openTierUpsell();
    }

    host.appendChild(el(`
      <div class="section-head" style="margin-top:6px">
        <h2>For you</h2>
        <span class="link legend" style="cursor:default">🧠 60% · 🧪 20% · 📊 20%</span>
      </div>`));

    const grid = el(`<div class="grid" id="feedGrid"></div>`);
    host.appendChild(grid);
    paintFeedGrid(grid);
  }

  // ---------- Tab 3: Following ----------
  function renderFollowingTab(host) {
    host.appendChild(el(`<div class="section-head" style="margin-top:6px"><h2>Creators you follow</h2><span class="link" style="cursor:pointer" id="followSeeMore">See more →</span></div>`));

    const list = el(`<div class="creator-list"></div>`);
    host.appendChild(list);
    const following = CREATORS.filter(c => state.following.includes(c.id));
    if (!following.length) {
      list.appendChild(el(`<div class="empty"><div class="big">👋</div><h3>You're not following anyone yet</h3><p>Follow a few curators to see their picks here.</p></div>`));
    } else {
      following.forEach(c => list.appendChild(creatorRow(c)));
    }

    host.appendChild(el(`<div class="section-head"><h2>Suggested for you</h2></div>`));
    const sugg = el(`<div class="creator-list"></div>`);
    host.appendChild(sugg);
    CREATORS.filter(c => !state.following.includes(c.id)).slice(0, 4).forEach(c => sugg.appendChild(creatorRow(c)));

    document.getElementById("followSeeMore").onclick = () => openFollowModal();
  }

  function creatorRow(c) {
    const following = state.following.includes(c.id);
    const node = el(`
      <div class="creator-row">
        <div class="avatar" style="background:${c.color}">${esc(c.avatar)}</div>
        <div class="creator-info">
          <div class="creator-name">${esc(c.name)}</div>
          <div class="creator-bio">${esc(c.bio)} · ${esc(c.followers)} followers</div>
        </div>
        <button class="follow-btn ${following ? "following" : ""}">${following ? "Following" : "Follow"}</button>
      </div>`);
    node.querySelector(".follow-btn").onclick = () => toggleFollow(c.id, node.querySelector(".follow-btn"));
    return node;
  }

  function toggleFollow(id, btn) {
    const i = state.following.indexOf(id);
    if (i >= 0) state.following.splice(i, 1); else state.following.push(id);
    save(LS.following, state.following);
    if (btn) { const now = state.following.includes(id); btn.classList.toggle("following", now); btn.textContent = now ? "Following" : "Follow"; }
    haptic([10]);
  }

  function openFollowModal() {
    document.getElementById("followBackdrop").hidden = false;
    document.querySelectorAll("#followTabs .studio-tab").forEach(t => t.classList.toggle("active", t.dataset.ftab === "following"));
    paintFollowList("following");
  }
  function closeFollowModal() { document.getElementById("followBackdrop").hidden = true; }

  function paintFollowList(tab) {
    const host = document.getElementById("followList");
    host.innerHTML = "";
    // "Followers" has no real inbound graph in this demo - show a distinct
    // mock subset so the pattern (list + toggle) is fully demonstrable.
    const pool = tab === "followers" ? CREATORS.slice().reverse() : CREATORS;
    pool.forEach(c => host.appendChild(creatorRow(c)));
  }

  // ---------- Tab 4: Collections ----------
  function renderCollectionsTab(host) {
    host.appendChild(el(`<div class="section-head" style="margin-top:6px"><h2>Browse collections</h2><span class="link" style="cursor:default">${COLLECTIONS.length} curated sets</span></div>`));
    const grid = el(`<div class="collection-grid"></div>`);
    host.appendChild(grid);
    COLLECTIONS.forEach(c => {
      const tile = el(`
        <div class="collection-tile" style="background:${c.grad}">
          <span class="ct-ico">${c.ico}</span>
          <h3>${esc(c.title)}</h3>
          <span>${c.cardIds.length + c.bookIds.length} items</span>
        </div>`);
      tile.onclick = () => { location.hash = "#/collection/" + c.id; };
      grid.appendChild(tile);
    });
  }

  function renderCollectionDetail(id) {
    const col = collectionById(id);
    if (!col) { view.appendChild(el(`<div class="empty"><div class="big">🤷</div><h3>Collection not found</h3><p><a class="back-link" href="#/home" data-link>← Back to feed</a></p></div>`)); return; }

    view.appendChild(el(`<div class="page-head"><a class="back-link" href="#/home" data-link>← Feed</a></div>`));
    view.appendChild(el(`
      <section class="topic-hero" style="background:${col.grad}">
        <span class="th-ico">${col.ico}</span>
        <h1>${esc(col.title)}</h1>
        <p>${col.cardIds.length} ideas · ${col.bookIds.length} books</p>
      </section>`));

    const cards = col.cardIds.map(cardById).filter(Boolean);
    if (cards.length) {
      view.appendChild(el(`<div class="section-head"><h2>Ideas in this collection</h2></div>`));
      const grid = el(`<div class="grid"></div>`);
      view.appendChild(grid);
      paintCards(grid, cards);
    }

    const books = col.bookIds.map(bookById).filter(Boolean);
    if (books.length) {
      view.appendChild(el(`<div class="section-head"><h2>Associated books</h2></div>`));
      const bgrid = el(`<div class="book-grid"></div>`);
      books.forEach(b => bgrid.appendChild(bookTile(b)));
      view.appendChild(bgrid);
    }
  }

  // ---------- Profile view ----------
  function renderProfile() {
    view.appendChild(el(`
      <div class="profile-head">
        <div class="avatar" id="profileAvatar">${initials()}</div>
        <div>
          <h1>${esc([user.profile.firstName, user.profile.lastName].filter(Boolean).join(" ") || "Your profile")}</h1>
          <p class="profile-bio">${esc(user.profile.bio || "No bio yet - add one from Settings.")}</p>
        </div>
      </div>`));
    paintAvatar(document.getElementById("profileAvatar"));

    view.appendChild(el(`<div class="section-head"><h2>Published</h2><span class="link" style="cursor:default">${state.custom.length} ideas</span></div>`));
    if (!state.custom.length) {
      view.appendChild(el(`
        <div class="empty">
          <div class="big">✍</div>
          <h3>Nothing Published Yet</h3>
          <p>Write Your Own Idea in the Studio and it'll show up here.</p>
          <button class="btn-primary" id="profileWriteBtn" style="margin-top:14px">Open Studio</button>
        </div>`));
      document.getElementById("profileWriteBtn").onclick = () => openStudio();
    } else {
      const grid = el(`<div class="grid"></div>`);
      view.appendChild(grid);
      paintCards(grid, state.custom);
    }
  }

  function paintFeedGrid(grid) {
    const { items, atCap } = capFeedForTier(feedList());
    paintCards(grid, items);
    if (atCap) {
      grid.appendChild(el(`
        <div class="empty gate-banner" style="grid-column:1/-1">
          <div class="big">🔒</div>
          <h3>You\'ve hit today\'s Freemium limit</h3>
          <p>Freemium includes ${FREEMIUM_DAILY_CAP} ideas a day. Upgrade to Pro for an unlimited daily feed.</p>
          <button class="btn-primary" id="upgradeBtn" style="margin-top:14px">Upgrade to Pro</button>
        </div>`));
      const ub = document.getElementById("upgradeBtn");
      if (ub) ub.onclick = () => openTierUpsell();
    }
  }

  function refreshFeed() {
    document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.textContent === state.filter));
    const grid = document.getElementById("feedGrid");
    if (grid) paintFeedGrid(grid);
  }

  // Unauthenticated guest home: 3 freely-browsable sample books plus a
  // small teaser of the feed, with a clear path into the onboarding funnel.
  function renderGuestHome() {
    view.appendChild(el(`
      <section class="hero">
        <div class="blob"></div><div class="blob b2"></div>
        <h1>Preview the library</h1>
        <p>Browse 3 sample books free - no account needed. Create one to unlock all 25 books and your personalised daily feed.</p>
        <div class="lp-cta-row" style="margin-top:16px;justify-content:flex-start">
          <a class="btn-primary" href="#/onboarding" data-link style="background:#fff;color:#7b2ff7">Get Started</a>
        </div>
      </section>`));

    view.appendChild(el(`<div class="section-head"><h2>Sample books</h2><span class="link" style="cursor:default">2 free ideas each</span></div>`));
    const bgrid = el(`<div class="book-grid"></div>`);
    SAMPLE_BOOK_IDS.map(bookById).filter(Boolean).forEach(b => bgrid.appendChild(bookTile(b)));
    view.appendChild(bgrid);

    view.appendChild(el(`<div class="section-head"><h2>What\'s inside</h2><span class="link" style="cursor:default">Unlocks after Get Started</span></div>`));
    const teaser = el(`<div class="grid" id="feedGrid"></div>`);
    view.appendChild(teaser);
    const preview = variableReward(CORE_CARDS.slice());
    paintCards(teaser, preview.slice(0, 3));
    teaser.appendChild(el(`
      <div class="empty gate-banner" style="grid-column:1/-1">
        <div class="big">🔒</div>
        <h3>Unlock unlimited daily ideas</h3>
        <p>Get Started to build your personalised feed, save ideas, and use spaced repetition.</p>
        <a class="btn-primary" href="#/onboarding" data-link style="margin-top:14px;display:inline-block">Get Started</a>
      </div>`));
  }

  function feedList() {
    let list = allCards();
    if (state.filter !== "All") list = list.filter(c => c.topic === state.filter);
    if (state.query) return matchQuery(list, state.query);   // search sees everything
    list = list.filter(isVisibleForReview);                  // hide cards scheduled for later
    return variableReward(list);                             // otherwise: variable reward
  }

  // A card shows in the daily feed only if it's new (never studied) or
  // its SM-2 nextReviewDate has arrived - this is the "quiet injection".
  function isVisibleForReview(c) {
    if (!window.SRS) return true;
    return SRS.isDue(c.id);
  }

  function renderExplore() {
    view.appendChild(el(`<div class="section-head" style="margin-top:6px"><h2>Explore topics</h2></div>`));
    const tg = el(`<div class="topic-grid"></div>`);
    TOPICS.forEach(t => {
      tg.appendChild(el(`<a class="topic-tile" href="#/topics/${t.slug}" data-link style="background:${t.grad}">
        <span class="t-ico">${t.ico}</span><h3>${t.name}</h3><span>${booksForTopic(t.name).length} books · ${t.ideas}</span></a>`));
    });
    view.appendChild(tg);

    view.appendChild(el(`<div class="section-head"><h2>Trending now</h2></div>`));
    const grid = el(`<div class="grid"></div>`);
    view.appendChild(grid);
    const trending = [...allCards()].sort((a, b) => ((b.likes || 0) + (b.saves || 0)) - ((a.likes || 0) + (a.saves || 0))).slice(0, 6);
    paintCards(grid, trending);
  }

  function renderTopics() {
    view.appendChild(el(`
      <section class="hero" style="margin-bottom:22px">
        <div class="blob"></div><div class="blob b2"></div>
        <h1>The library</h1>
        <p>${BOOKS.length} curated books, broken into ${FLASHCARDS.length} standalone ideas. Pick a topic and go deep.</p>
      </section>`));

    view.appendChild(el(`<div class="section-head" style="margin-top:6px"><h2>All topics</h2><span class="link" style="cursor:default">${TOPICS.length} shelves</span></div>`));
    const tg = el(`<div class="topic-grid"></div>`);
    TOPICS.forEach(t => {
      const n = booksForTopic(t.name).length;
      tg.appendChild(el(`<a class="topic-tile" href="#/topics/${t.slug}" data-link style="background:${t.grad}">
        <span class="t-ico">${t.ico}</span><h3>${t.name}</h3><span>${n} book${n !== 1 ? "s" : ""} · ${t.ideas}</span></a>`));
    });
    view.appendChild(tg);

    view.appendChild(el(`<div class="section-head"><h2>Featured books</h2></div>`));
    const grid = el(`<div class="book-grid"></div>`);
    ["atomic-habits", "twelve-rules", "deep-work", "meditations", "thinking-fast-slow", "mindset", "flow", "essentialism"]
      .map(bookById).filter(Boolean).forEach(b => grid.appendChild(bookTile(b)));
    view.appendChild(grid);
  }

  function renderSaved() {
    view.appendChild(el(`<div class="section-head" style="margin-top:6px"><h2>Your stash</h2><span class="link" style="cursor:default">${state.saved.length} saved</span></div>`));
    let list = state.saved.map(cardById).filter(Boolean);
    if (state.query) list = matchQuery(list, state.query);
    if (!list.length) {
      view.appendChild(el(`<div class="empty"><div class="big">🔖</div><h3>Nothing stashed yet</h3><p>Tap the bookmark on any card to save it here for later.</p></div>`));
      return;
    }
    const grid = el(`<div class="grid"></div>`);
    view.appendChild(grid);
    paintCards(grid, list);
  }

  /* ============================================================
     LANDING PAGE
     ============================================================ */
  function renderLanding() {
    document.body.classList.add("landing");
    const featured = bookById("atomic-habits");
    const featuredCards = cardsForBook("atomic-habits").slice(0, 2);
    const stripBooks = ["atomic-habits", "twelve-rules", "deep-work", "meditations", "thinking-fast-slow", "mindset", "essentialism", "flow"].map(bookById).filter(Boolean);

    const lp = el(`<div class="lp"></div>`);
    lp.innerHTML = `
      <nav class="lp-nav">
        <a class="brand" href="#/" data-link><svg class="brand-mark" width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="lpBrandMarkCore" x1="13" y1="13" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#B79AE0" /><stop offset="100%" stop-color="#8B5FBF" /></linearGradient><radialGradient id="lpBrandMarkGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#8B5FBF" stop-opacity="0.55" /><stop offset="100%" stop-color="#8B5FBF" stop-opacity="0" /></radialGradient></defs><circle cx="20" cy="20" r="19" fill="url(#lpBrandMarkGlow)" /><path d="M17,1 A16,16 0 0 1 33,17 A16,16 0 0 1 17,33 A16,16 0 0 1 1,17 L1,1 Z" stroke="#241849" stroke-width="2" /><path d="M17,7 A10,10 0 0 1 27,17 A10,10 0 0 1 17,27 A10,10 0 0 1 7,17 L7,7 Z" stroke="#3D2B6B" stroke-width="2" /><path d="M17,13 A4,4 0 0 1 21,17 A4,4 0 0 1 17,21 A4,4 0 0 1 13,17 L13,13 Z" fill="url(#lpBrandMarkCore)" /><rect x="28.7" y="1.7" width="4.5" height="4.5" fill="#B8923C" transform="rotate(45 31 4)" /></svg><span class="brand-name">Synapse</span></a>
        <div class="lp-nav-links">
          <a href="#/topics" data-link>Library</a>
          <a href="#lp-pricing">Pricing</a>
          <a href="#lp-faq">FAQ</a>
        </div>
        <div class="lp-nav-actions">
          <button class="btn-secondary" id="lpThemeBtn" style="padding:10px 18px;font-size:14px">🌓</button>
          <a class="btn-primary" style="padding:11px 22px;font-size:14px" href="#/onboarding" data-link>Get Started</a>
        </div>
      </nav>

      <!-- ============ HERO ============ -->
      <section class="lp-hero">
        <span class="float-badge b1">🏆 Welcome to the 1%</span>
        <span class="float-badge b2">🧠 2.4M ideas stashed</span>
        <span class="float-badge b3">⏱ 15 min a day</span>
        <div class="float-cover c1" style="background:${featured.coverColor}">⚛</div>
        <div class="float-cover c2" style="background:#7b2ff7">🧩</div>
        <div class="float-cover c3" style="background:#8e6e53">🏛</div>
        <div class="lp-wrap lp-hero-inner">
          <span class="lp-eyebrow">Bite-sized sparks, full-length reads</span>
          <h1>Built to guide you off the screen <span class="grad">The only feed</span></h1>
          <p class="lp-lede">Spark ideas from top nonfiction books in minutes, then go read the rest.</p>
          <div class="lp-cta-row">
            <a class="btn-primary" href="#/onboarding" data-link>Get Started</a>
            <a class="btn-secondary" href="#/onboarding" data-link>Build a Growth Plan</a>
          </div>
          <div class="lp-trust">★★★★★ Loved by 10M+ thinkers · Free forever plan</div>
        </div>
      </section>

      <!-- ============ MOCKUP + LASER SCAN ============ -->
      <section class="lp-mockup">
        <div class="lp-wrap">
          <h2 class="lp-h">One book. Scanned into ideas.</h2>
          <p class="lp-sub">We break each book into standalone mental models you can absorb between two subway stops.</p>
        </div>
        <div class="carousel-strip" id="stripRail">
          ${stripBooks.map(b => `
            <a class="strip-book ${b.id === "atomic-habits" ? "is-featured" : ""}" href="#/book/${b.id}" data-link>
              <img class="sb-cover" src="${bookCover(b)}" alt="${esc(b.title)}" loading="lazy" />
              <div class="sb-title">${esc(b.title)}</div>
            </a>`).join("")}
        </div>

        <div class="phone-stage">
          <div class="phone">
            <div class="phone-screen" id="phoneScreen">
              <div class="scan-beam"></div>
              <div class="phone-face cover-face">
                <img src="${bookCover(featured)}" alt="${esc(featured.title)}" />
                <div class="pf-t">${esc(featured.title)}</div>
                <div class="pf-a">${esc(featured.author)}</div>
              </div>
              <div class="phone-face card-face">
                <div class="mini-card">
                  <div class="mc-kicker">Improve 1% every day</div>
                  <div class="mc-t">${esc(featuredCards[0].title)}</div>
                  <div class="mc-b">${esc(featuredCards[0].body.slice(0, 96))}…</div>
                </div>
                <div class="mini-card">
                  <div class="mc-kicker">${esc(featuredCards[1].ruleNumberOrChapter)}</div>
                  <div class="mc-t">${esc(featuredCards[1].title)}</div>
                  <div class="mc-b">${esc(featuredCards[1].body.slice(0, 84))}…</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mockup-hint">↑ Watch the scanner turn a 320-page book into micro-flashcards</div>
      </section>

      <!-- ============ MINDSET / ATTENTION ============ -->
      <section class="lp-mindset">
        <div class="glow-orb"></div>
        <div class="lp-wrap">
          <div class="mindset-stack">
            <div class="mindset-line l1 on" id="mind1">Your attention is the real currency</div>
            <div class="mindset-line l2" id="mind2">Do not give it away to <span class="hot">noise on socials</span></div>
          </div>
          <div class="mindset-foot">The average person burns 2.5 hours a day on feeds engineered to keep them. This one is engineered to release them.</div>
        </div>
      </section>

      <!-- ============ BENEFITS ============ -->
      <section class="lp-benefits">
        <div class="lp-wrap">
          <div class="pill-grid">
            ${BENEFIT_PILLS.map(p => `<div class="benefit-pill"><span class="bp-ico">${p.ico}</span>${esc(p.text)}</div>`).join("")}
          </div>
        </div>
      </section>

      <!-- ============ TOPIC DIRECTORY + RIBBON ============ -->
      <section class="lp-directory">
        <div class="lp-wrap">
          <h2 class="lp-h">Pick a lane. Go deep.</h2>
          <p class="lp-sub">Curated libraries across the topics that compound - each one a shelf of books broken into ideas.</p>
          <div class="topic-pills" id="topicPills">
            ${TOPICS.slice(0, 6).map((t, i) => `<button class="tp ${i === 0 ? "active" : ""}" data-topic="${esc(t.name)}">${t.ico} ${esc(t.name)}</button>`).join("")}
          </div>
        </div>
        <div class="ribbon"><div class="ribbon-track" id="ribbonTrack"></div></div>
      </section>

      <!-- ============ FEATURES ============ -->
      <section class="lp-features">
        <div class="lp-wrap">
          <h2 class="lp-h">Your mind is your greatest asset</h2>
          <p class="lp-sub">Four deliberate design choices that separate learning from scrolling.</p>
          <div class="feature-grid">
            ${FEATURES.map(f => `
              <div class="feature-card">
                <div class="fc-ico">${f.ico}</div>
                <h3>${esc(f.title)}</h3>
                <p>${esc(f.body)}</p>
              </div>`).join("")}
          </div>
        </div>
      </section>

      <!-- ============ PRICING ============ -->
      <section class="lp-pricing" id="lp-pricing">
        <div class="lp-wrap">
          <h2 class="lp-h">Invest in yourself</h2>
          <p class="lp-sub">The cheapest compounding asset you will ever buy.</p>
          <div class="price-table">
            <div class="price-head">
              <div><div class="ph-name">What you get</div><div class="ph-note">Compare the plans</div></div>
              <div>
                <div class="ph-name">${esc(PRICING.tiers[0].name)}</div>
                <div class="ph-price">${esc(PRICING.tiers[0].price)}</div>
                <div class="ph-period">${esc(PRICING.tiers[0].period)}</div>
                <div class="ph-note">${esc(PRICING.tiers[0].note)}</div>
              </div>
              <div class="pro-col">
                <span class="pro-tag">Most popular</span>
                <div class="ph-name">${esc(PRICING.tiers[1].name)}</div>
                <div class="ph-price">${esc(PRICING.tiers[1].price)}</div>
                <div class="ph-period">${esc(PRICING.tiers[1].period)}</div>
                <div class="ph-note">${esc(PRICING.tiers[1].note)}</div>
              </div>
            </div>
            ${PRICING.features.map(f => `
              <div class="price-row">
                <div class="pr-label">${esc(f.label)}</div>
                <div>${priceCell(f.free)}</div>
                <div class="pro-col">${priceCell(f.pro)}</div>
              </div>`).join("")}
            <div class="price-foot">
              <div></div>
              <div><a class="mini-cta" href="#/onboarding" data-link>${esc(PRICING.tiers[0].cta)}</a></div>
              <div class="pro-col"><button class="mini-cta pro" id="proCta">${esc(PRICING.tiers[1].cta)}</button></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ REVIEWS ============ -->
      <section class="lp-reviews">
        <div class="lp-wrap">
          <h2 class="lp-h">Loved by 10M+ thinkers</h2>
          <p class="lp-sub">People who traded the infinite scroll for a finite, useful 15 minutes.</p>
        </div>
        <div class="review-rail" id="reviewRail">
          ${TESTIMONIALS.map(t => `
            <div class="review-card">
              <div class="rv-stars">${"★".repeat(t.rating)}${"☆".repeat(5 - t.rating)}</div>
              <p class="rv-quote">“${esc(t.quote)}”</p>
              <div class="rv-who">
                <div class="rv-av" style="background:${t.color}">${esc(t.avatar)}</div>
                <div><div class="rv-name">${esc(t.name)}</div><div class="rv-handle">${esc(t.handle)}</div></div>
              </div>
            </div>`).join("")}
        </div>
        <div class="rail-ctrl">
          <button class="rail-btn" id="railPrev" aria-label="Previous reviews">‹</button>
          <button class="rail-btn" id="railNext" aria-label="More reviews">›</button>
        </div>
      </section>

      <!-- ============ FAQ ============ -->
      <section class="lp-faq" id="lp-faq">
        <div class="lp-wrap">
          <h2 class="lp-h">What. The. FAQ?</h2>
          <p class="lp-sub">The questions people actually ask before they start.</p>
          <div class="faq-list" id="faqList">
            ${FAQS.map((f, i) => `
              <div class="faq-item" data-i="${i}">
                <button class="faq-q" aria-expanded="false">${esc(f.q)}<span class="faq-mark">＋</span></button>
                <div class="faq-a"><div class="faq-a-inner"><p>${esc(f.a)}</p></div></div>
              </div>`).join("")}
          </div>
        </div>
      </section>

      <!-- ============ FINAL CTA ============ -->
      <section class="lp-final">
        <div class="lp-final-box">
          <h2>15 minutes today beats 3 hours of scrolling</h2>
          <p>Start with one idea. Let spaced repetition handle the rest.</p>
          <a class="btn-primary" href="#/onboarding" data-link>Get Started - it's free</a>
        </div>
      </section>
      <div class="lp-footer">Built as a Synapse-inspired demo · All reading data stays on your device</div>`;

    view.appendChild(lp);
    wireLanding();
  }

  function priceCell(v) {
    if (v === true) return `<span class="chk yes">✓</span>`;
    if (v === false) return `<span class="chk no">✕</span>`;
    return `<span>${esc(v)}</span>`;
  }

  function wireLanding() {
    // --- theme shortcut
    const tb = document.getElementById("lpThemeBtn");
    if (tb) tb.onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

    // --- laser scan drives the mockup's inner transition
    const screen = document.getElementById("phoneScreen");
    if (screen) {
      const t = setInterval(() => screen.classList.toggle("scanned"), 3200);
      onTeardown(() => clearInterval(t));
      screen.onclick = () => { screen.classList.toggle("scanned"); haptic([15, 30]); };
    }

    // --- mindset typographic transition
    const m1 = document.getElementById("mind1"), m2 = document.getElementById("mind2");
    if (m1 && m2) {
      let on = 0;
      const t = setInterval(() => {
        on = 1 - on;
        m1.classList.toggle("on", on === 0);
        m2.classList.toggle("on", on === 1);
      }, 3400);
      onTeardown(() => clearInterval(t));
    }

    // --- topic pills filter the infinite ribbon
    const pills = document.getElementById("topicPills"), track = document.getElementById("ribbonTrack");
    const paintRibbon = (topicName) => {
      const books = booksForTopic(topicName);
      const one = books.map(b => `
        <a class="ribbon-book" href="#/book/${b.id}" data-link>
          <img src="${bookCover(b)}" alt="${esc(b.title)}" loading="lazy" />
          <div class="rb-t">${esc(b.title)}</div>
          <div class="rb-a">${esc(b.author)}</div>
        </a>`).join("");
      track.innerHTML = one + one;   // duplicated for a seamless -50% marquee
    };
    if (pills && track) {
      paintRibbon(TOPICS[0].name);
      pills.querySelectorAll(".tp").forEach(p => {
        p.onclick = () => {
          pills.querySelectorAll(".tp").forEach(x => x.classList.remove("active"));
          p.classList.add("active");
          paintRibbon(p.dataset.topic);
          haptic([10]);
        };
      });
    }

    // --- reviews carousel
    const rail = document.getElementById("reviewRail");
    if (rail) {
      const step = () => Math.min(rail.clientWidth * 0.85, 640);
      document.getElementById("railPrev").onclick = () => rail.scrollBy({ left: -step(), behavior: "smooth" });
      document.getElementById("railNext").onclick = () => rail.scrollBy({ left: step(), behavior: "smooth" });
    }

    // --- FAQ accordion
    document.querySelectorAll("#faqList .faq-item").forEach(item => {
      const btn = item.querySelector(".faq-q");
      btn.onclick = () => {
        const open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        haptic([10]);
      };
    });

    const pro = document.getElementById("proCta");
    if (pro) pro.onclick = () => { haptic([15, 30]); toast("Pro is a demo tier - everything here is already unlocked ✨"); };
  }

  /* ============================================================
     TOPIC DETAIL  ·  #/topics/:slug
     ============================================================ */
  function renderTopicDetail(slug) {
    const topic = topicBySlug(slug);
    if (!topic) { view.appendChild(el(`<div class="empty"><div class="big">🤷</div><h3>Topic not found</h3><p><a class="back-link" href="#/topics" data-link>← Back to the library</a></p></div>`)); return; }

    const books = booksForTopic(topic.name);
    view.appendChild(el(`<div class="page-head"><a class="back-link" href="#/topics" data-link>← Library</a></div>`));
    view.appendChild(el(`
      <section class="topic-hero" style="background:${topic.grad}">
        <span class="th-ico">${topic.ico}</span>
        <h1>${esc(topic.name)}</h1>
        <p>${esc(topic.blurb)} · ${books.length} books · ${topic.ideas}</p>
      </section>`));

    view.appendChild(el(`<div class="section-head"><h2>Curated books</h2><span class="link" style="cursor:default">${books.length} titles</span></div>`));
    const grid = el(`<div class="book-grid"></div>`);
    books.forEach(b => grid.appendChild(bookTile(b)));
    view.appendChild(grid);

    // sibling topics
    view.appendChild(el(`<div class="section-head"><h2>Related topics</h2></div>`));
    const chips = el(`<div class="chips"></div>`);
    TOPICS.filter(t => t.slug !== slug).slice(0, 7).forEach(t =>
      chips.appendChild(el(`<a class="chip" href="#/topics/${t.slug}" data-link>${t.ico} ${esc(t.name)}</a>`)));
    view.appendChild(chips);
  }

  function bookTile(b) {
    const n = cardsForBook(b.id).length;
    return el(`
      <a class="book-tile" href="#/book/${b.id}" data-link>
        <img src="${bookCover(b)}" alt="${esc(b.title)}" loading="lazy" />
        <div>
          <div class="bt-title">${esc(b.title)}</div>
          <div class="bt-author">${esc(b.author)}</div>
          <div class="bt-meta">${n} ideas · ${b.minutes} min</div>
        </div>
      </a>`);
  }

  /* ============================================================
     BOOK DETAIL  ·  #/book/:id
     ============================================================ */
  function renderBookDetail(bookId) {
    const book = bookById(bookId);
    if (!book) { view.appendChild(el(`<div class="empty"><div class="big">📕</div><h3>Book not found</h3><p><a class="back-link" href="#/topics" data-link>← Back to the library</a></p></div>`)); return; }

    // The daily feed only returns a slice of the catalogue, so pull this
    // book's full deck from GET /api/books/{slug} the first time it's opened
    // and repaint once it lands. No-ops offline or on a repeat visit.
    hydrateBookCards(bookId).then(added => {
      if (added && currentRoute().param === bookId) router();
    });

    const cards = cardsForBook(book.id);
    const topic = TOPICS.find(t => t.name === book.topic);
    const isSample = SAMPLE_BOOK_IDS.includes(book.id);
    const guestLocked = isGuest() && !isSample;

    view.appendChild(el(`<div class="page-head"><a class="back-link" href="#/topics/${topic ? topic.slug : ""}" data-link>← ${esc(book.topic)}</a></div>`));

    const head = el(`
      <section class="book-head">
        <img src="${bookCover(book)}" alt="${esc(book.title)}" />
        <div>
          <h1>${esc(book.title)}</h1>
          <div class="bh-author">${esc(book.author)} · ${book.year}</div>
          <p class="bh-desc">${esc(book.description)}</p>
          <div class="bh-meta">
            <span class="bh-chip">📖 ${cards.length} key ideas</span>
            <span class="bh-chip">⏱ ${book.minutes} min read</span>
            <span class="bh-chip">${topic ? topic.ico : "📚"} ${esc(book.topic)}</span>
            ${isGuest() && isSample ? `<span class="bh-chip sample-chip">👀 Preview book</span>` : ""}
          </div>
          <div class="bh-actions">
            ${guestLocked
              ? `<button class="btn-primary" id="startReading" style="padding:13px 26px;font-size:15px">🔒 Get Started to unlock</button>`
              : `<button class="btn-primary" id="startReading" style="padding:13px 26px;font-size:15px">Start reading →</button>
                 <button class="btn-secondary" id="stashBook" style="padding:13px 26px;font-size:15px">🔖 Stash all ideas</button>`}
          </div>
        </div>
      </section>`);
    view.appendChild(head);

    if (guestLocked) {
      view.appendChild(lockPanel(
        "This book is part of the full library",
        "Create a free account to unlock every idea in this book, all 25 books, and spaced repetition that keeps them memorised."
      ));
      head.querySelector("#startReading").onclick = () => openGate("library");
      return;
    }

    view.appendChild(el(`<div class="section-head"><h2>Main ideas</h2><span class="link" style="cursor:default">${isGuest() ? "Preview - 2 free ideas" : "Tap any card to go full screen"}</span></div>`));
    const grid = el(`<div class="idea-grid"></div>`);
    const previewCap = isGuest() ? 2 : Infinity;
    cards.forEach((c, i) => grid.appendChild(ideaCard(c, book, i, i >= previewCap)));
    view.appendChild(grid);

    // related topics
    const rel = [book.topic, ...(book.relatedTopics || [])];
    view.appendChild(el(`<div class="section-head"><h2>Explore related topics</h2></div>`));
    const chips = el(`<div class="chips"></div>`);
    rel.forEach(name => {
      const t = TOPICS.find(x => x.name === name);
      if (t) chips.appendChild(el(`<a class="chip" href="#/topics/${t.slug}" data-link>${t.ico} ${esc(t.name)}</a>`));
    });
    view.appendChild(chips);

    // similar books
    const sim = (book.similarBookIds || []).map(bookById).filter(Boolean);
    if (sim.length) {
      view.appendChild(el(`<div class="section-head"><h2>Similar books</h2></div>`));
      const sgrid = el(`<div class="book-grid"></div>`);
      sim.forEach(b => sgrid.appendChild(bookTile(b)));
      view.appendChild(sgrid);
    }

    head.querySelector("#startReading").onclick = () => openReader(book.id, cards[0].id);
    const stashBtn = head.querySelector("#stashBook");
    if (stashBtn) stashBtn.onclick = () => {
      let added = 0;
      cards.forEach(c => { if (!state.saved.includes(c.id)) { state.saved.push(c.id); added++; } });
      save(LS.saved, state.saved); updateSavedCount(); haptic([15, 30]);
      toast(added ? `${added} ideas stashed 🔖` : "Already in your stash");
    };
  }

  function lockPanel(title, body) {
    return el(`
      <div class="empty gate-banner" style="margin:20px 0">
        <div class="big">🔒</div>
        <h3>${esc(title)}</h3>
        <p>${esc(body)}</p>
        <a class="btn-primary" href="#/onboarding" data-link style="margin-top:14px;display:inline-block">Get Started</a>
      </div>`);
  }

  function ideaCard(c, book, i, locked) {
    const s = window.SRS && SRS.get(c.id);
    const stateLabel = !s ? "🆕 New" : (s.nextReviewDate <= Date.now() ? "🗓 Due" : "✓ " + relTime(s.nextReviewDate));
    const node = el(`
      <article class="idea-card ${locked ? "card-locked" : ""}">
        <div class="idea-visual">
          <img src="${cardVisual(c)}" alt="" loading="lazy" />
          <span class="idea-rule">${esc(c.ruleNumberOrChapter)}</span>
        </div>
        <div class="idea-body">
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.body.length > 132 ? c.body.slice(0, 132) + "…" : c.body)}</p>
          <div class="idea-cliff">${esc(c.zeigarnikCliffhanger)}</div>
          <div class="idea-foot">
            <button class="view-more">${locked ? "🔒 Unlock" : "View More"}</button>
            <span class="idea-state">${locked ? "" : stateLabel}</span>
          </div>
        </div>
        ${locked ? `<div class="lock-overlay"><span class="lock-ico">🔒</span><p>Unlock full insights</p><button class="lock-cta">Get Started</button></div>` : ""}
      </article>`);
    if (locked) {
      node.querySelector(".lock-cta").onclick = () => openGate("preview");
      node.querySelector(".view-more").onclick = () => openGate("preview");
    } else {
      node.querySelector(".view-more").onclick = () => openReader(book.id, c.id);
      node.querySelector(".idea-visual").onclick = () => openReader(book.id, c.id);
    }
    return node;
  }

  /* ============================================================
     FULLSCREEN FLASHCARD READER (immersive + SM-2)
     ============================================================ */
  let readerCards = [], readerIdx = 0, readerBook = null, readerOpen = false;

  function openReader(bookId, cardId) {
    const cardsForThisBook = cardsForBook(bookId);
    const idx = Math.max(0, cardsForThisBook.findIndex(c => c.id === cardId));

    if (isGuest()) {
      const isSample = SAMPLE_BOOK_IDS.includes(bookId);
      if (!isSample || idx >= 2) { openGate(isSample ? "preview" : "library"); return; }
      user.guestPreviewCount[bookId] = Math.max(user.guestPreviewCount[bookId] || 0, idx + 1);
      saveUser();
    }

    readerBook = bookById(bookId);
    readerCards = cardsForThisBook;
    readerIdx = idx;
    readerOpen = true;
    document.getElementById("reader").hidden = false;
    document.body.classList.add("reader-open");
    haptic([15, 30]);
    paintReader();
  }

  function closeReader(silent) {
    if (!readerOpen) return;
    readerOpen = false;
    document.getElementById("reader").hidden = true;
    document.body.classList.remove("reader-open");
    if (!silent) haptic([10]);
    // refresh the book page so review states update
    if (!silent && currentRoute().base === "/book") router();
  }

  function readerStep(delta) {
    const next = readerIdx + delta;
    if (next < 0 || next >= readerCards.length) { closeReader(); return; }
    if (isGuest() && SAMPLE_BOOK_IDS.includes(readerBook.id) && next >= 2) { closeReader(true); openGate("preview"); return; }
    readerIdx = next; haptic([10]); paintReader();
  }

  function paintReader() {
    const c = readerCards[readerIdx];
    if (!c) return;
    markRead(c.id);

    document.getElementById("readerCrumb").textContent = `${readerBook.title} · ${readerBook.author}`;
    document.getElementById("readerCount").textContent = `${readerIdx + 1} / ${readerCards.length}`;
    document.getElementById("readerPrev").disabled = readerIdx === 0;
    document.getElementById("readerNext").disabled = readerIdx === readerCards.length - 1;

    const s = window.SRS && SRS.get(c.id);
    document.getElementById("readerSchedule").textContent = s
      ? (s.nextReviewDate <= Date.now() ? "Due now · how well did you recall it?" : `Scheduled ${relTime(s.nextReviewDate)} · EF ${s.easeFactor.toFixed(2)}`)
      : "How well did you recall this?";

    document.getElementById("readerCard").innerHTML = `
      <div class="reader-visual"><img src="${cardVisual(c)}" alt="" /></div>
      <div class="reader-kicker">
        <span class="reader-pill">${esc(c.ruleNumberOrChapter)}</span>
        <span class="reader-pill" style="background:var(--surface-2);color:var(--text-faint)">${esc(readerBook.topic)}</span>
        <button class="btn-listen spacer" id="readerListenBtn" title="Listen to idea">🎧 Listen</button>
      </div>
      <h1>${esc(c.title)}</h1>
      <p class="reader-text">${esc(c.body)}</p>
      <div class="reader-cliff"><span class="rc-ico">🔓</span><p>${esc(c.zeigarnikCliffhanger)}</p></div>
      ${interactiveHTML(c)}`;

    document.getElementById("readerListenBtn").onclick = () => playCardAudio(c);
    wireReaderInteractive(c);
    paintGrades(c);
  }

  function interactiveHTML(c) {
    if (c.interactiveType === "reflection") {
      const saved = load("ds_note_" + c.id, "");
      return `<div class="reader-inter">
        <h4>✍ Make it yours</h4>
        <textarea rows="3" id="rNote" placeholder="Where does this show up in your week?">${esc(saved)}</textarea>
      </div>`;
    }
    if (c.interactiveType === "choice") {
      return `<div class="reader-inter">
        <h4>🤔 Gut check</h4>
        <div class="ch-options">
          <button class="ch-opt" data-v="yes">I already do this</button>
          <button class="ch-opt" data-v="no">This is a gap</button>
        </div>
        <div class="sb-verdict" id="rChoiceOut">Pick one - honesty compounds.</div>
      </div>`;
    }
    // AI-ingested sandbox: a slider + a server-validated arithmetic formula
    // (backend/ai_ingestion.py validate_formula). Reuses the home feed's
    // .sandbox/.sb-* styling.
    if (c.interactiveType === "slider" && c.interactiveData && c.interactiveData.slider) {
      const sl = c.interactiveData.slider;
      return `<div class="sandbox">
        <div class="sb-output">
          <div class="sb-main" id="sbMain">–</div>
          <div class="sb-sub">${esc(c.interactiveData.resultLabel || "")}</div>
        </div>
        <input class="sb-range" id="sbRange" type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${sl.value}" />
        <div class="sb-scale">
          <span>${esc(sl.leftLabel || "")}</span>
          <span class="sb-val" id="sbVal"></span>
          <span>${esc(sl.rightLabel || "")}</span>
        </div>
        <div class="sb-verdict" id="sbVerdict">Drag to see the outcome.</div>
      </div>`;
    }
    // AI-ingested diagram: sanitised on the server (backend strips
    // <script>/on*/javascript: before it ever reaches the database).
    if (c.kind === "diagram" && c.svg) {
      return `<div class="dgm-wrap">${c.svg}</div>
        ${c.insight ? `<div class="dgm-insight"><span class="legend">💡</span><span>${esc(c.insight)}</span></div>` : ""}`;
    }
    return "";
  }

  function wireReaderInteractive(c) {
    const note = document.getElementById("rNote");
    if (note) note.oninput = () => save("ds_note_" + c.id, note.value);

    document.querySelectorAll("#readerCard .ch-opt").forEach(b => {
      b.onclick = () => {
        haptic([15, 30]);
        const out = document.getElementById("rChoiceOut");
        const yes = b.dataset.v === "yes";
        out.textContent = yes
          ? "Then grade it Easy - spaced repetition will keep it warm without wasting your reps."
          : "Then grade it Hard. It'll come back tomorrow, which is exactly what a gap needs.";
        out.className = "sb-verdict " + (yes ? "good" : "bad");
      };
    });

    const range = document.getElementById("sbRange");
    if (range && c.interactiveType === "slider" && c.interactiveData) {
      wireSandboxSlider(range, c.interactiveData);
    }
  }

  // Evaluates a model-authored arithmetic expression WITHOUT eval()/Function().
  // Grammar mirrors the server-side allowlist exactly (backend/ai_ingestion.py
  // validate_formula): v, numeric literals, + - * / ** %, parens, and the
  // functions min max abs round pow sqrt log exp floor ceil. Anything else -
  // an identifier, a stray character, unbalanced parens - throws rather than
  // silently returning something. The server already proved the formula is
  // safe-shaped; this proves it independently on the client rather than
  // trusting that shape blindly.
  function evalSafeFormula(expr, v) {
    const FUNCS = {
      min: Math.min, max: Math.max, abs: Math.abs, round: Math.round, pow: Math.pow,
      sqrt: Math.sqrt, log: Math.log, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
    };
    const s = String(expr);
    let i = 0;
    const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };

    function parseExpr() {
      let left = parseTerm();
      for (;;) {
        skip();
        if (s[i] === "+" || s[i] === "-") { const op = s[i++]; left = op === "+" ? left + parseTerm() : left - parseTerm(); }
        else break;
      }
      return left;
    }
    function parseTerm() {
      let left = parsePower();
      for (;;) {
        skip();
        if (s[i] === "*" && s[i + 1] !== "*") { i++; left *= parsePower(); }
        else if (s[i] === "/") { i++; left /= parsePower(); }
        else if (s[i] === "%") { i++; left %= parsePower(); }
        else break;
      }
      return left;
    }
    function parsePower() {
      const base = parseUnary();
      skip();
      if (s[i] === "*" && s[i + 1] === "*") { i += 2; return Math.pow(base, parsePower()); }
      return base;
    }
    function parseUnary() {
      skip();
      if (s[i] === "-") { i++; return -parseUnary(); }
      if (s[i] === "+") { i++; return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      skip();
      if (s[i] === "(") {
        i++; const v2 = parseExpr(); skip();
        if (s[i] !== ")") throw new Error("expected )");
        i++; return v2;
      }
      const num = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i));
      if (num) { i += num[0].length; return parseFloat(num[0]); }
      const id = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i));
      if (id) {
        const name = id[0]; i += name.length; skip();
        if (s[i] === "(") {
          i++; const args = [];
          skip();
          if (s[i] !== ")") {
            args.push(parseExpr()); skip();
            while (s[i] === ",") { i++; args.push(parseExpr()); skip(); }
          }
          if (s[i] !== ")") throw new Error("expected )");
          i++;
          if (!Object.prototype.hasOwnProperty.call(FUNCS, name)) throw new Error("unknown function: " + name);
          return FUNCS[name](...args);
        }
        if (name === "v") return v;
        throw new Error("unknown identifier: " + name);
      }
      throw new Error("unexpected token at position " + i);
    }

    const result = parseExpr();
    skip();
    if (i !== s.length) throw new Error("unexpected trailing input");
    if (typeof result !== "number" || !isFinite(result)) throw new Error("formula did not evaluate to a finite number");
    return result;
  }

  function wireSandboxSlider(range, cfg) {
    const mainEl = document.getElementById("sbMain");
    const valEl = document.getElementById("sbVal");
    const verdictEl = document.getElementById("sbVerdict");

    const paint = () => {
      const v = parseFloat(range.value);
      valEl.textContent = v + (cfg.slider.unit || "");

      let result;
      try { result = evalSafeFormula(cfg.formula, v); }
      catch { result = null; }

      if (result == null) {
        mainEl.textContent = "-";
        verdictEl.textContent = "Couldn't compute this one.";
        verdictEl.className = "sb-verdict";
        return;
      }

      const rounded = Math.abs(result) >= 10 ? Math.round(result) : Math.round(result * 100) / 100;
      mainEl.textContent = (cfg.resultPrefix || "") + rounded + (cfg.resultSuffix || "");

      let tone = "neutral", verdict = cfg.verdicts && cfg.verdicts.neutral;
      if (result <= cfg.badBelow) { tone = "bad"; verdict = cfg.verdicts && cfg.verdicts.bad; }
      else if (result >= cfg.goodAbove) { tone = "good"; verdict = cfg.verdicts && cfg.verdicts.good; }
      verdictEl.textContent = verdict || "";
      verdictEl.className = "sb-verdict " + tone;
    };

    range.addEventListener("input", () => { haptic([6]); paint(); });
    paint();
  }

  function paintGrades(c) {
    const host = document.getElementById("readerGrades");
    if (!window.SRS) { host.innerHTML = ""; return; }
    host.innerHTML = SRS.BUTTONS.map(b =>
      `<button class="grade-btn ${b.key}" data-q="${b.q}">${b.label}<small>${fmtDays(SRS.preview(c.id, b.q))}</small></button>`).join("");
    host.querySelectorAll(".grade-btn").forEach(btn => {
      btn.onclick = () => {
        haptic([15, 30]);
        const rec = SRS.review(c.id, parseInt(btn.dataset.q, 10));
        updateDue();
        toast(`Next review in ${fmtDays(rec.interval)} ⏳`);
        if (readerIdx < readerCards.length - 1) { readerIdx++; paintReader(); }
        else closeReader();
      };
    });
  }

  /* ============================================================
     ONBOARDING ENGINE - 5-stage personalization funnel
     ------------------------------------------------------------
     A flat, ordered list of screens. Several UI "steps" from the
     spec span multiple screens (e.g. Step 3 covers growth areas,
     a value interstitial, role model, thinking style, personality
     and the habits quiz) so each screen stays single-purpose.
     `user.onboardingStep` tracks the STEP for resuming; `screenIdx`
     tracks the exact screen within the current session.
     ============================================================ */
  const ONBOARD_SCREENS = [
    { id: "auth",              step: 1 },
    { id: "demographics",      step: 2 },
    { id: "welcome",           step: 2 },
    { id: "growth-areas",      step: 3 },
    { id: "value-1",           step: 3 },
    { id: "role-model",        step: 3 },
    { id: "thinking-style",    step: 3 },
    { id: "personality",       step: 3 },
    { id: "habits-quiz",       step: 3 },
    { id: "brand-aware",       step: 4 },
    { id: "book-discovery",    step: 4 },
    { id: "pace",              step: 4 },
    { id: "formats",           step: 4 },
    { id: "calibrating",       step: 5 },
    { id: "growth-projection", step: 5 },
    { id: "tier-selection",    step: 5 },
  ];
  const AGE_GROUPS = ["18–24", "25–34", "35–44", "45+"];

  let screenIdx = 0;
  let authMode = "create";      // "create" | "signin"
  let discoveryIdx = 0;         // sub-stepper for the book-discovery screen
  let calibProgress = 0;        // 0..100 for the calibration loader
  let calibChecksAnswered = {}; // { [microCheckId]: true }

  function renderOnboarding(hash) {
    document.body.classList.add("onboarding-mode");
    const qs = hash.split("?")[1] || "";
    if (/mode=signin/.test(qs)) authMode = "signin";

    if (user.isAuthenticated) {
      const target = ONBOARD_SCREENS.findIndex(s => s.step === user.onboardingStep);
      screenIdx = target >= 0 ? target : 1;
      if (ONBOARD_SCREENS[screenIdx].id === "auth") screenIdx = 1;
    } else {
      screenIdx = 0;
    }

    paintOnboardShell();
    paintOnboardScreen();
  }

  function paintOnboardShell() {
    view.innerHTML = `
      <div class="wizard">
        <div class="wizard-top">
          <a class="wizard-exit" href="#/" data-link title="Exit">✕</a>
          <div class="wizard-progress" id="wizProgress">
            ${[1, 2, 3, 4, 5].map(n => `<div class="wiz-seg" data-n="${n}"><div class="wiz-seg-fill"></div></div>`).join("")}
          </div>
          <div class="wizard-step-label" id="wizStepLabel"></div>
        </div>
        <div class="wizard-body" id="wizBody"></div>
      </div>`;
  }

  function paintOnboardScreen() {
    if (currentRoute().base !== "/onboarding") return;
    const screen = ONBOARD_SCREENS[screenIdx];
    user.onboardingStep = Math.max(user.onboardingStep || 1, screen.step);
    saveUser();

    const screensInStep = ONBOARD_SCREENS.filter(s => s.step === screen.step);
    const posInStep = screensInStep.indexOf(screen);
    document.querySelectorAll(".wiz-seg").forEach(seg => {
      const n = parseInt(seg.dataset.n, 10);
      const fill = seg.querySelector(".wiz-seg-fill");
      if (n < screen.step) fill.style.width = "100%";
      else if (n === screen.step) fill.style.width = Math.round((posInStep / screensInStep.length) * 100) + "%";
      else fill.style.width = "0%";
    });
    setText("wizStepLabel", `Step ${screen.step} of 5`);

    const body = document.getElementById("wizBody");
    body.innerHTML = "";
    body.appendChild(renderOnboardScreen(screen.id));
  }

  function goNext() { if (screenIdx < ONBOARD_SCREENS.length - 1) { screenIdx++; paintOnboardScreen(); } }
  function goBack() { if (screenIdx > 0) { screenIdx--; paintOnboardScreen(); } }
  function goToScreenId(id) {
    if (currentRoute().base !== "/onboarding") return;
    const i = ONBOARD_SCREENS.findIndex(s => s.id === id);
    if (i >= 0) { screenIdx = i; paintOnboardScreen(); }
  }

  function wizFooter(showBack, continueLabel) {
    return `
      <div class="wiz-actions">
        ${showBack ? `<button class="wiz-back" id="wizBack">‹ Back</button>` : `<span></span>`}
        <button class="btn-primary wiz-continue" id="wizContinue" disabled>${continueLabel || "Continue →"}</button>
      </div>`;
  }
  function wireWizFooter(node, { onContinue }) {
    const back = node.querySelector("#wizBack");
    if (back) back.onclick = () => { haptic([10]); goBack(); };
    const cont = node.querySelector("#wizContinue");
    cont.__enable = (ok) => { cont.disabled = !ok; };
    cont.onclick = () => { if (!cont.disabled) { haptic([15, 30]); onContinue(); } };
    return cont;
  }

  function renderOnboardScreen(id) {
    switch (id) {
      case "auth":              return screenAuth();
      case "demographics":      return screenDemographics();
      case "welcome":           return screenWelcome();
      case "growth-areas":      return screenGrowthAreas();
      case "value-1":           return screenValueInterstitial("Understand big ideas in minutes instead of hours.", "role-model");
      case "role-model":        return screenRoleModel();
      case "thinking-style":    return screenThinkingStyle();
      case "personality":       return screenPersonality();
      case "habits-quiz":       return screenHabitsQuiz();
      case "brand-aware":       return screenBrandAware();
      case "book-discovery":    return screenBookDiscovery();
      case "pace":              return screenPace();
      case "formats":           return screenFormats();
      case "calibrating":       return screenCalibrating();
      case "growth-projection": return screenGrowthProjection();
      case "tier-selection":    return screenTierSelection();
      default:                  return el(`<div class="wiz-screen"><p>Unknown step.</p></div>`);
    }
  }

  // ---------- Step 1 : Authentication gate ----------
  function screenAuth() {
    const node = el(`
      <div class="wiz-screen wiz-auth">
        <h1 class="wiz-h">${authMode === "create" ? "Create your account" : "Welcome back"}</h1>
        <p class="wiz-sub">${authMode === "create" ? "Takes 20 seconds. No credit card." : "Sign in to pick up where you left off."}</p>
        <div class="auth-tabs">
          <button class="auth-tab" data-m="create">Create Account</button>
          <button class="auth-tab" data-m="signin">Sign In</button>
        </div>
        <div id="authForm"></div>
        <p class="wiz-error" id="authError" hidden></p>
      </div>`);

    const val2 = (id) => node.querySelector("#" + id).value.trim();
    const showError = (msg) => { const e = node.querySelector("#authError"); e.textContent = msg; e.hidden = false; };

    const paintForm = () => {
      node.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.m === authMode));
      node.querySelector("#authError").hidden = true;
      const f = node.querySelector("#authForm");
      f.innerHTML = authMode === "create" ? `
        <label class="field"><span>First name</span><input id="aFirst" /></label>
        <label class="field"><span>Last name</span><input id="aLast" /></label>
        <label class="field"><span>Phone number</span><input id="aPhone" type="tel" /></label>
        <label class="field"><span>Email</span><input id="aEmail" type="email" /></label>
        <label class="field"><span>Password</span><input id="aPass" type="password" /></label>
        <button class="btn-primary wiz-full" id="authSubmit">Create account →</button>
      ` : `
        <label class="field"><span>Email</span><input id="aEmail" type="email" /></label>
        <label class="field"><span>Password</span><input id="aPass" type="password" /></label>
        <button class="btn-primary wiz-full" id="authSubmit">Sign in →</button>
      `;
      node.querySelector("#authSubmit").onclick = authMode === "create" ? handleCreateAccount : handleSignIn;
    };

    node.querySelectorAll(".auth-tab").forEach(t => t.onclick = () => { authMode = t.dataset.m; paintForm(); });

    async function handleCreateAccount() {
      const first = val2("aFirst"), last = val2("aLast"), email = val2("aEmail"), pass = val2("aPass");
      if (!first || !email || !pass || !/^\S+@\S+\.\S+$/.test(email)) {
        showError("Please fill in your name, a valid email, and a password.");
        return;
      }

      try {
        const res = await fetch(`${INGEST_API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email,
            password: pass,
            firstName: first,
            lastName: last
          })
        });

        if (!res.ok) {
          const err = await res.json();
          showError(err.detail || "Registration failed.");
          return;
        }

        const data = await res.json();
        
        user.token = data.accessToken;
        localStorage.setItem("ds_api_token", data.accessToken);

        user.isAuthenticated = true;
        user.tier = data.user.tier;
        user.onboardingStep = 2;
        user.profile.firstName = first;
        user.profile.lastName = last;
        user.profile.email = email;
        saveUser();

        haptic([15, 30]);
        goToScreenId("demographics");
      } catch (err) {
        showError("Could not connect to backend server. Make sure port 8001 is running.");
      }
    }

    async function handleSignIn() {
      const email = val2("aEmail"), pass = val2("aPass");
      if (!email || !pass) {
        showError("Please enter both email and password.");
        return;
      }

      try {
        const res = await fetch(`${INGEST_API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, password: pass })
        });

        if (!res.ok) {
          const err = await res.json();
          showError(err.detail || "Incorrect email or password.");
          return;
        }

        const data = await res.json();

        user.token = data.accessToken;
        localStorage.setItem("ds_api_token", data.accessToken);

        user.isAuthenticated = true;
        user.tier = data.user.tier;
        user.profile.firstName = data.user.firstName;
        user.profile.lastName = data.user.lastName;
        user.profile.email = data.user.email;
        saveUser();

        haptic([15, 30]);
        toast("Welcome back! 👋");
        location.hash = "#/home";
      } catch (err) {
        showError("Could not connect to backend server.");
      }
    }

    paintForm();
    return node;
  }

  // ---------- Step 2 : Demographics + welcome interstitial ----------
  function paintSingleSelect(container, activeBtn) {
    container.querySelectorAll(".pill-opt, .two-card, .pill-card, .figure-card, .pace-card").forEach(b => b.classList.toggle("active", b === activeBtn));
  }

  function screenDemographics() {
    const node = el(`
      <div class="wiz-screen">
        <div class="wiz-banner">⏱ 3–4 min personal growth assessment</div>
        <h1 class="wiz-h">Tell us a bit about you</h1>
        <p class="wiz-sub">This shapes which books and ideas we show you first.</p>
        <div class="wiz-block">
          <h4>Age group</h4>
          <div class="pill-select" id="ageSelect">
            ${AGE_GROUPS.map(a => `<button class="pill-opt ${user.profile.ageGroup === a ? "active" : ""}" data-v="${a}">${a}</button>`).join("")}
          </div>
        </div>
        <div class="wiz-block">
          <h4>Gender identity</h4>
          <div class="pill-select" id="genderSelect">
            ${["Male", "Female", "Other"].map(g => `<button class="pill-opt ${user.profile.gender === g ? "active" : ""}" data-v="${g}">${g}</button>`).join("")}
          </div>
        </div>
        ${wizFooter(false, "Continue →")}
      </div>`);

    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("welcome") });
    const check = () => cont.__enable(!!user.profile.ageGroup && !!user.profile.gender);
    node.querySelector("#ageSelect").onclick = (e) => {
      const b = e.target.closest(".pill-opt"); if (!b) return;
      user.profile.ageGroup = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#ageSelect"), b); check(); haptic([10]);
    };
    node.querySelector("#genderSelect").onclick = (e) => {
      const b = e.target.closest(".pill-opt"); if (!b) return;
      user.profile.gender = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#genderSelect"), b); check(); haptic([10]);
    };
    check();
    return node;
  }

  function screenWelcome() {
    const node = el(`
      <div class="wiz-screen wiz-interstitial">
        <div class="wiz-interstitial-card">
          <div class="wiz-emoji">✨</div>
          <h1 class="wiz-h">Glad you are here ✨</h1>
          <p class="wiz-sub">Let's find out what makes you tick.</p>
        </div>
      </div>`);
    const t = setTimeout(() => goToScreenId("growth-areas"), 1800);
    onTeardown(() => clearTimeout(t));
    node.onclick = () => { clearTimeout(t); goToScreenId("growth-areas"); };
    requestAnimationFrame(() => node.querySelector(".wiz-interstitial-card").classList.add("in"));
    return node;
  }

  // ---------- Step 3 : Focus areas + cognitive profiling ----------
  function screenGrowthAreas() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Choose areas you'd like to elevate</h1>
        <p class="wiz-sub">Pick as many as apply - we'll calibrate your feed around these.</p>
        <div class="pill-grid-select" id="gaSelect">
          ${GROWTH_AREAS.map(g => `<button class="pill-card ${user.profile.growthAreas.includes(g.id) ? "active" : ""}" data-v="${g.id}"><span class="pc-ico">${g.ico}</span>${esc(g.label)}</button>`).join("")}
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("value-1") });
    const check = () => cont.__enable(user.profile.growthAreas.length > 0);
    node.querySelector("#gaSelect").onclick = (e) => {
      const b = e.target.closest(".pill-card"); if (!b) return;
      const arr = user.profile.growthAreas, id = b.dataset.v, i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      b.classList.toggle("active"); saveUser(); check(); haptic([10]);
    };
    check();
    return node;
  }

  function screenValueInterstitial(text, nextId) {
    const node = el(`
      <div class="wiz-screen wiz-interstitial">
        <div class="wiz-interstitial-card">
          <div class="wiz-emoji">💡</div>
          <h1 class="wiz-h">${esc(text)}</h1>
        </div>
        ${wizFooter(false, "Got it →")}
      </div>`);
    wireWizFooter(node, { onContinue: () => goToScreenId(nextId) }).__enable(true);
    requestAnimationFrame(() => node.querySelector(".wiz-interstitial-card").classList.add("in"));
    return node;
  }

  function screenRoleModel() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Whose principles inspire you most?</h1>
        <p class="wiz-sub">Pick the thinker whose approach to life resonates with you.</p>
        <div class="figure-grid" id="figSelect">
          ${INSPIRING_FIGURES.map(f => `
            <button class="figure-card ${user.profile.roleModel === f.id ? "active" : ""}" data-v="${f.id}">
              <span class="fig-ico">${f.ico}</span><div class="fig-name">${esc(f.name)}</div><div class="fig-blurb">${esc(f.blurb)}</div>
            </button>`).join("")}
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("thinking-style") });
    node.querySelector("#figSelect").onclick = (e) => {
      const b = e.target.closest(".figure-card"); if (!b) return;
      user.profile.roleModel = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#figSelect"), b);
      cont.__enable(true); haptic([10]);
    };
    cont.__enable(!!user.profile.roleModel);
    return node;
  }

  function screenThinkingStyle() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">How do you usually think?</h1>
        <div class="two-card-select" id="tsSelect">
          ${THINKING_STYLES.map(t => `<button class="two-card ${user.profile.thinkingStyle === t.id ? "active" : ""}" data-v="${t.id}"><span class="tc-ico">${t.ico}</span>${esc(t.label)}</button>`).join("")}
        </div>
        <div class="wiz-feedback" id="tsFeedback" hidden></div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("personality") });
    const paintFeedback = () => {
      const t = THINKING_STYLES.find(x => x.id === user.profile.thinkingStyle);
      const fb = node.querySelector("#tsFeedback");
      if (t) { fb.hidden = false; fb.textContent = t.feedback; }
    };
    node.querySelector("#tsSelect").onclick = (e) => {
      const b = e.target.closest(".two-card"); if (!b) return;
      user.profile.thinkingStyle = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#tsSelect"), b);
      paintFeedback(); cont.__enable(true); haptic([15, 30]);
    };
    paintFeedback();
    cont.__enable(!!user.profile.thinkingStyle);
    return node;
  }

  function screenPersonality() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Introvert or extrovert?</h1>
        <div class="two-card-select" id="pSelect">
          ${PERSONALITY_TYPES.map(t => `<button class="two-card ${user.profile.personality === t.id ? "active" : ""}" data-v="${t.id}"><span class="tc-ico">${t.ico}</span>${esc(t.label)}</button>`).join("")}
        </div>
        <div class="wiz-feedback" id="pFeedback" hidden></div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("habits-quiz") });
    const paintFeedback = () => {
      const t = PERSONALITY_TYPES.find(x => x.id === user.profile.personality);
      const fb = node.querySelector("#pFeedback");
      if (t) { fb.hidden = false; fb.textContent = t.feedback; }
    };
    node.querySelector("#pSelect").onclick = (e) => {
      const b = e.target.closest(".two-card"); if (!b) return;
      user.profile.personality = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#pSelect"), b);
      paintFeedback(); cont.__enable(true); haptic([15, 30]);
    };
    paintFeedback();
    cont.__enable(!!user.profile.personality);
    return node;
  }

  function screenHabitsQuiz() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Quick habits check</h1>
        <p class="wiz-sub" id="hqProgress">0 / ${HABIT_QUIZ_QUESTIONS.length} answered</p>
        <div class="quiz-list">
          ${HABIT_QUIZ_QUESTIONS.map(q => `
            <div class="quiz-row" data-q="${q.id}">
              <div class="quiz-q">${esc(q.q)}</div>
              <div class="quiz-yn">
                <button class="yn-btn" data-v="yes">Yes</button>
                <button class="yn-btn" data-v="no">No</button>
              </div>
            </div>`).join("")}
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("brand-aware") });
    const updateProgress = () => {
      const answered = HABIT_QUIZ_QUESTIONS.filter(q => user.profile.habits[q.id]).length;
      node.querySelector("#hqProgress").textContent = `${answered} / ${HABIT_QUIZ_QUESTIONS.length} answered`;
      cont.__enable(answered === HABIT_QUIZ_QUESTIONS.length);
    };
    node.querySelectorAll(".quiz-row").forEach(row => {
      const qid = row.dataset.q;
      if (user.profile.habits[qid]) row.querySelectorAll(".yn-btn").forEach(b => b.classList.toggle("active", b.dataset.v === user.profile.habits[qid]));
      row.querySelector(".quiz-yn").onclick = (e) => {
        const b = e.target.closest(".yn-btn"); if (!b) return;
        user.profile.habits[qid] = b.dataset.v; saveUser();
        row.querySelectorAll(".yn-btn").forEach(x => x.classList.toggle("active", x === b));
        updateProgress(); haptic([10]);
      };
    });
    updateProgress();
    return node;
  }

  // ---------- Step 4 : Content calibration + goal setting ----------
  function screenBrandAware() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Have you heard about Synapse before?</h1>
        <div class="two-card-select" id="baSelect">
          <button class="two-card ${user.profile.brandAware === true ? "active" : ""}" data-v="yes"><span class="tc-ico">👍</span>Yes</button>
          <button class="two-card ${user.profile.brandAware === false ? "active" : ""}" data-v="no"><span class="tc-ico">🤷</span>No</button>
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("book-discovery") });
    node.querySelector("#baSelect").onclick = (e) => {
      const b = e.target.closest(".two-card"); if (!b) return;
      user.profile.brandAware = b.dataset.v === "yes"; saveUser();
      paintSingleSelect(node.querySelector("#baSelect"), b);
      cont.__enable(true); haptic([10]);
    };
    cont.__enable(user.profile.brandAware !== null);
    return node;
  }

  function screenBookDiscovery() {
    discoveryIdx = 0;
    const node = el(`<div class="wiz-screen wiz-discovery" id="discoveryHost"></div>`);
    const paintCard = () => {
      if (discoveryIdx >= DISCOVERY_BOOK_IDS.length) { goToScreenId("pace"); return; }
      const book = bookById(DISCOVERY_BOOK_IDS[discoveryIdx]);
      node.innerHTML = `
        <p class="wiz-sub" style="text-align:center">Book ${discoveryIdx + 1} of ${DISCOVERY_BOOK_IDS.length}</p>
        <div class="discovery-card">
          <img src="${bookCover(book)}" alt="${esc(book.title)}" />
          <h2>${esc(book.title)}</h2>
          <div class="bh-author" style="text-align:center">${esc(book.author)}</div>
          <p class="wiz-sub">${esc(book.description.slice(0, 110))}…</p>
        </div>
        <p class="wiz-h" style="font-size:19px">Does this book seem interesting to you?</p>
        <div class="discovery-actions">
          <button class="disc-btn no" id="discNo">Not really</button>
          <button class="disc-btn yes" id="discYes">Yes 👍</button>
        </div>`;
      node.querySelector("#discYes").onclick = () => answer(true);
      node.querySelector("#discNo").onclick = () => answer(false);
    };
    const answer = (yes) => {
      const id = DISCOVERY_BOOK_IDS[discoveryIdx];
      if (yes && !user.profile.bookInterests.includes(id)) user.profile.bookInterests.push(id);
      saveUser(); haptic([15, 30]);
      discoveryIdx++;
      paintCard();
    };
    paintCard();
    return node;
  }

  function screenPace() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">Pick your daily pace</h1>
        <p class="wiz-sub">You can always change this later.</p>
        <div class="pace-grid" id="paceSelect">
          ${PACE_OPTIONS.map(p => `
            <button class="pace-card ${user.profile.dailyPace === p.id ? "active" : ""}" data-v="${p.id}">
              <div class="pace-label">${esc(p.label)}</div><div class="pace-desc">${esc(p.desc)}</div>
            </button>`).join("")}
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("formats") });
    node.querySelector("#paceSelect").onclick = (e) => {
      const b = e.target.closest(".pace-card"); if (!b) return;
      user.profile.dailyPace = b.dataset.v; saveUser();
      paintSingleSelect(node.querySelector("#paceSelect"), b);
      cont.__enable(true); haptic([10]);
    };
    cont.__enable(!!user.profile.dailyPace);
    return node;
  }

  function screenFormats() {
    const node = el(`
      <div class="wiz-screen">
        <h1 class="wiz-h">How do you like to learn?</h1>
        <p class="wiz-sub">Pick every format you enjoy.</p>
        <div class="pill-grid-select" id="fmtSelect">
          ${LEARNING_FORMATS.map(f => `<button class="pill-card ${user.profile.learningFormats.includes(f.id) ? "active" : ""}" data-v="${f.id}"><span class="pc-ico">${f.ico}</span>${esc(f.label)}</button>`).join("")}
        </div>
        ${wizFooter(true, "Continue →")}
      </div>`);
    const cont = wireWizFooter(node, { onContinue: () => goToScreenId("calibrating") });
    const check = () => cont.__enable(user.profile.learningFormats.length > 0);
    node.querySelector("#fmtSelect").onclick = (e) => {
      const b = e.target.closest(".pill-card"); if (!b) return;
      const arr = user.profile.learningFormats, id = b.dataset.v, i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      b.classList.toggle("active"); saveUser(); check(); haptic([10]);
    };
    check();
    return node;
  }

  // ---------- Step 5 : Dynamic calibration + roadmap + tier ----------
  function screenCalibrating() {
    calibProgress = 0;
    calibChecksAnswered = {};
    const node = el(`
      <div class="wiz-screen wiz-calibrate">
        <h1 class="wiz-h">Building your feed…</h1>
        <p class="wiz-sub" id="calibLabel">Analysing your answers</p>
        <div class="calib-ring">
          <svg viewBox="0 0 120 120"><circle class="cr-track" cx="60" cy="60" r="52"/><circle class="cr-fill" id="calibArc" cx="60" cy="60" r="52"/></svg>
          <div class="calib-pct" id="calibPct">0%</div>
        </div>
        <div class="calib-check" id="calibCheck" hidden></div>
      </div>`);

    const CIRC = 2 * Math.PI * 52;
    const arc = node.querySelector("#calibArc");
    arc.style.strokeDasharray = CIRC;
    arc.style.strokeDashoffset = CIRC;
    const paint = () => {
      node.querySelector("#calibPct").textContent = calibProgress + "%";
      arc.style.strokeDashoffset = CIRC - (calibProgress / 100) * CIRC;
    };

    let paused = false;
    const milestones = [25, 55, 85];
    const askCheck = (q) => {
      paused = true;
      const box = node.querySelector("#calibCheck");
      box.hidden = false;
      box.innerHTML = `
        <p>${esc(q.q)}</p>
        <div class="discovery-actions">
          <button class="disc-btn no" data-v="no">No</button>
          <button class="disc-btn yes" data-v="yes">Yes</button>
        </div>`;
      box.querySelector(".discovery-actions").onclick = (e) => {
        const b = e.target.closest(".disc-btn"); if (!b) return;
        user.profile.habits[q.id] = b.dataset.v; saveUser(); haptic([15, 30]);
        calibChecksAnswered[q.id] = true;
        box.hidden = true;
        paused = false;
      };
    };

    const timer = setInterval(() => {
      if (paused) return;
      calibProgress = Math.min(100, calibProgress + 2);
      paint();
      milestones.forEach((m, i) => {
        const q = MICRO_CHECK_QUESTIONS[i];
        if (calibProgress >= m && !calibChecksAnswered[q.id] && !paused) askCheck(q);
      });
      if (calibProgress >= 100 && Object.keys(calibChecksAnswered).length >= MICRO_CHECK_QUESTIONS.length) {
        clearInterval(timer);
        setText("calibLabel", "Done - here's your roadmap");
        const done = setTimeout(() => goToScreenId("growth-projection"), 700);
        onTeardown(() => clearTimeout(done));
      }
    }, 90);
    onTeardown(() => clearInterval(timer));
    paint();
    return node;
  }

  function screenGrowthProjection() {
    const pace = PACE_OPTIONS.find(p => p.id === user.profile.dailyPace) || PACE_OPTIONS[1];
    const { lo, hi } = projectBooksPerMonth(pace.minutes);
    const areas = user.profile.growthAreas.map(id => GROWTH_AREAS.find(g => g.id === id)).filter(Boolean);
    const node = el(`
      <div class="wiz-screen wiz-projection">
        <div class="proj-badge">🎯 Your growth roadmap</div>
        <h1 class="wiz-h">At your pace, you'll finish</h1>
        <div class="proj-stat">${lo}–${hi}<span>books / month</span></div>
        <p class="wiz-sub">Based on ${pace.desc} across ${esc(areas.map(a => a.label).join(", ") || "your chosen topics")}.</p>
        <div class="proj-grid">
          <div class="proj-tile"><div class="pt-num">${pace.minutes}</div><div class="pt-label">min / day</div></div>
          <div class="proj-tile"><div class="pt-num">${areas.length || TOPICS.length}</div><div class="pt-label">focus areas</div></div>
          <div class="proj-tile"><div class="pt-num">${user.profile.learningFormats.length || 1}</div><div class="pt-label">formats</div></div>
        </div>
        ${wizFooter(false, "See my plan →")}
      </div>`);
    wireWizFooter(node, { onContinue: () => goToScreenId("tier-selection") }).__enable(true);
    return node;
  }

  function screenTierSelection() {
    const proFeats = PRICING.features.filter(f => f.pro === true || typeof f.pro === "string").slice(0, 6);
    const node = el(`
      <div class="wiz-screen wiz-tiers">
        <h1 class="wiz-h">Choose how you start</h1>
        <p class="wiz-sub">Switch any time from Settings.</p>
        <div class="tier-cards">
          <div class="tier-card pro">
            <div class="tier-badge">Recommended</div>
            <h3>Pro</h3>
            <div class="tier-price">$4<span>/mo</span></div>
            <ul class="tier-feats">${proFeats.map(f => `<li>✓ ${esc(f.label)}</li>`).join("")}</ul>
            <button class="btn-primary wiz-full" id="pickPro">Get Smarter →</button>
          </div>
          <div class="tier-card free">
            <h3>Freemium</h3>
            <div class="tier-price">$0</div>
            <p class="tier-sub">3–5 books/day, 20–30 cards</p>
            <button class="btn-secondary wiz-full" id="pickFree">Continue with Freemium</button>
          </div>
        </div>
      </div>`);
    node.querySelector("#pickPro").onclick = () => finishOnboarding("pro");
    node.querySelector("#pickFree").onclick = () => finishOnboarding("freemium");
    return node;
  }

  function finishOnboarding(tier) {
    user.tier = tier;
    user.onboardingComplete = true;
    saveUser();
    haptic([20, 40, 20]);
    toast(tier === "pro" ? "Welcome to Pro 🎉" : "You're set - welcome to Freemium 🎉");
    location.hash = "#/home";
  }

  /* ============================================================
     CARD DISPATCHER
     ============================================================ */
  function paintCards(container, list) {
    container.innerHTML = "";
    if (!list.length) {
      container.appendChild(el(`<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h3>No cards found</h3><p>Try a different topic or search term.</p></div>`));
      return;
    }
    list.forEach(c => container.appendChild(card(c)));
  }

  function card(c) {
    markRead(c.id);
    switch (c.kind) {
      case "sandbox": return sandboxCard(c);
      case "diagram": return diagramCard(c);
      default:        return coreCard(c);
    }
  }

  // shared header + footer -------------------------------------------------
  const KIND_PILL = {
    core:    { label: "Mental model", ico: "🧠" },
    sandbox: { label: "Interactive", ico: "🧪" },
    diagram: { label: "Visual",      ico: "📊" },
  };

  function headerHTML(c) {
    const pill = KIND_PILL[c.kind] || KIND_PILL.core;
    return `
      <div class="card-top">
        <div class="card-source">
          <div class="source-cover" style="background:${c.coverColor}">${c.cover || "📖"}</div>
          <div class="source-meta">
            <div class="source-name">${esc(c.source)}</div>
            <div class="source-type">${esc(c.type)}${c.author ? " · " + esc(c.author) : ""}</div>
          </div>
        </div>
        <span class="kind-pill kp-${c.kind}">${pill.ico} ${pill.label}</span>
      </div>`;
  }

  function footerHTML(c) {
    const liked = state.liked.includes(c.id), saved = state.saved.includes(c.id), likes = c.likes || 0;
    const commentCount = _allCommentsForCard(c.id).length;
    return `
      <div class="card-foot">
        <button class="act like ${liked ? "liked" : ""}"><span class="ico">${liked ? "❤️" : "🤍"}</span><span class="cnt">${fmt(likes + (liked ? 1 : 0))}</span></button>
        <button class="act comment-btn" title="Discussion"><span class="ico">💬</span><span class="cnt">${commentCount}</span></button>
        <button class="act save ${saved ? "saved" : ""}"><span class="ico">${saved ? "🔖" : "📑"}</span><span class="lbl">${saved ? "Saved" : "Save"}</span></button>
        <button class="btn-listen spacer" title="Listen to idea">🎧 Listen</button>
        <button class="act share"><span class="ico">↗</span><span>Share</span></button>
      </div>`;
  }

  function wireFooter(node, c) {
    node.querySelector(".like").onclick        = () => toggleLike(c.id, node);
    node.querySelector(".comment-btn").onclick = () => openCommentDrawer(c.id);
    const saveBtn = node.querySelector(".save");
    saveBtn.onclick   = () => openStashPopover(c.id, saveBtn);
    node.querySelector(".btn-listen").onclick  = () => playCardAudio(c);
    node.querySelector(".share").onclick       = () => openShareModal(c);
  }

  function wireCard(node, c) { wireFooter(node, c); wireSrs(node, c); }

  // ---------- SM-2 review row (shared by all card kinds) ----------
  function srsRowHTML(c) {
    if (!window.SRS) return "";
    const s = SRS.get(c.id), now = Date.now();
    const status = !s
      ? "🆕 New card"
      : s.nextReviewDate <= now
        ? "🗓 Due for review"
        : "✓ Scheduled · " + relTime(s.nextReviewDate);
    const ef = s ? `<span class="srs-ef">EF ${s.easeFactor.toFixed(2)}</span>` : "";
    const btns = SRS.BUTTONS.map(b =>
      `<button class="srs-btn ${b.key}" data-q="${b.q}">${b.label}<small>${fmtDays(SRS.preview(c.id, b.q))}</small></button>`
    ).join("");
    return `
      <div class="srs">
        <div class="srs-head"><span class="srs-status">${status}</span>${ef}</div>
        <div class="srs-btns">${btns}</div>
      </div>`;
  }

  function wireSrs(node, c) {
    if (!window.SRS) return;
    node.querySelectorAll(".srs-btn").forEach(btn => {
      btn.onclick = () => {
        haptic([15, 30]);
        const rec = SRS.review(c.id, parseInt(btn.dataset.q, 10));
        toast(`Next review ${fmtDays(rec.interval) === "<1d" ? "today" : "in " + fmtDays(rec.interval)} ⏳`);
        updateDue();

        const statusEl = node.querySelector(".srs-status");
        if (statusEl) statusEl.textContent = "✓ Scheduled · " + relTime(rec.nextReviewDate);
        const efEl = node.querySelector(".srs-ef");
        if (efEl) efEl.textContent = "EF " + rec.easeFactor.toFixed(2);
        // refresh interval hints for the new state
        node.querySelectorAll(".srs-btn").forEach(b => {
          const small = b.querySelector("small");
          if (small) small.textContent = fmtDays(SRS.preview(c.id, parseInt(b.dataset.q, 10)));
        });

        // On the home feed a graded card gracefully leaves - it's now scheduled.
        if (currentRoute().path === "/home") {
          node.classList.add("graded");
          setTimeout(() => {
            node.classList.add("removing");
            setTimeout(() => { node.remove(); checkCaughtUp(); }, 360);
          }, 650);
        }
      };
    });
  }

  function checkCaughtUp() {
    const grid = document.getElementById("feedGrid");
    if (grid && !grid.querySelector(".card")) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🎉</div><h3>You're all caught up</h3><p>Every due card is reviewed. New cards return on their SM-2 schedule.</p></div>`;
    }
  }

  /* ---------- 1) CORE KNOWLEDGE CARD ---------- */
  function coreCard(c) {
    const node = el(`
      <article class="card card-core">
        ${headerHTML(c)}
        <h3 class="card-title">${esc(c.title)}</h3>
        <p class="card-body">${esc(c.body)}</p>
        <div class="cliff" role="button" tabindex="0">
          <div class="cliff-teaser"><span class="cliff-ico">🔓</span><span>${esc(c.cliffhanger)}</span></div>
          <div class="cliff-more" hidden>${esc(c.unlock || "")}</div>
          <span class="cliff-cta">Continue →</span>
        </div>
        <span class="card-topic">#${esc(c.topic)}</span>
        ${srsRowHTML(c)}
        ${footerHTML(c)}
      </article>`);

    const cliff = node.querySelector(".cliff");
    const reveal = () => {
      if (cliff.classList.contains("open")) return;
      cliff.classList.add("open");
      cliff.querySelector(".cliff-more").hidden = false;
      cliff.querySelector(".cliff-cta").textContent = "You closed the loop ✓";
      haptic([12, 20]);
      markRead(c.id);
    };
    cliff.onclick = reveal;
    cliff.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } };

    wireCard(node, c);
    return node;
  }

  /* ---------- 2) INTERACTIVE MICRO-SANDBOX ---------- */
  function sandboxCard(c) {
    if (c.mode === "slider" && (!c.slider || typeof c.compute !== "function")) {
      return coreCard(c);
    }
    if (c.mode !== "slider" && (!c.nodes || !c.start)) {
      return coreCard(c);
    }

    const node = el(`
      <article class="card card-sandbox">
        ${headerHTML(c)}
        <h3 class="card-title">${esc(c.title)}</h3>
        <p class="card-body">${esc(c.prompt || c.body || "")}</p>
        <div class="sandbox"></div>
        <span class="card-topic">#${esc(c.topic)}</span>
        ${srsRowHTML(c)}
        ${footerHTML(c)}
      </article>`);

    const host = node.querySelector(".sandbox");
    if (c.mode === "slider") buildSlider(host, c);
    else buildChoice(host, c);

    wireCard(node, c);
    return node;
  }

  function buildSlider(host, c) {
    const s = c.slider;
    host.innerHTML = `
      <div class="sb-output">
        <div class="sb-main">-</div>
        <div class="sb-sub">${esc(s.unit ? "" : "")}</div>
      </div>
      <input class="sb-range" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"
             aria-label="${esc(c.title)}" />
      <div class="sb-scale"><span>${esc(s.leftLabel || s.min)}</span><span class="sb-val">${s.value}${esc(s.unit || "")}</span><span>${esc(s.rightLabel || s.max)}</span></div>
      <div class="sb-verdict">Drag to run the model.</div>`;

    const range   = host.querySelector(".sb-range");
    const mainEl  = host.querySelector(".sb-main");
    const subEl   = host.querySelector(".sb-sub");
    const valEl   = host.querySelector(".sb-val");
    const verdict = host.querySelector(".sb-verdict");

    const run = (buzz) => {
      const v = parseFloat(range.value);
      const r = c.compute(v);
      mainEl.textContent = r.main;
      subEl.textContent  = r.sub;
      valEl.textContent  = (s.step < 1 ? v.toFixed(1) : v) + (s.unit || "");
      verdict.textContent = r.verdict;
      verdict.className = "sb-verdict " + (r.tone || "neutral");
      paintRange(range);
      if (buzz) haptic([15, 30]);
    };

    range.addEventListener("input", () => run(true));
    run(false); // initial paint, no vibration
  }

  function buildChoice(host, c) {
    if (!c || !c.nodes || !c.start) {
      if (host) host.innerHTML = `<div class="sb-verdict">Interaction unavailable.</div>`;
      return;
    }

    const render = (nodeId) => {
      const n = c.nodes[nodeId];
      if (!n) return;

      if (n.insight) {
        host.innerHTML = `
          <div class="ch-insight"><span class="ch-ico">🌱</span><p>${esc(n.insight)}</p></div>
          <button class="ch-restart">↺ Walk it again</button>`;
        host.querySelector(".ch-restart").onclick = () => { haptic([15, 30]); render(c.start); };
        return;
      }
      host.innerHTML = `
        <div class="ch-q">${esc(n.q)}</div>
        <div class="ch-options"></div>`;
      const opts = host.querySelector(".ch-options");
      (n.options || []).forEach(o => {
        const b = el(`<button class="ch-opt">${esc(o.label)}</button>`);
        b.onclick = () => { haptic([15, 30]); render(o.to); };
        opts.appendChild(b);
      });
    };
    render(c.start);
  }

  /* ---------- 3) VISUAL FACT DIAGRAM ---------- */
  function diagramCard(c) {
    const visual = c.svg ? c.svg : (c.chart ? buildBarChart(c.chart) : "");
    const node = el(`
      <article class="card card-diagram">
        ${headerHTML(c)}
        <h3 class="card-title">${esc(c.title)}</h3>
        <div class="dgm-wrap">${visual}</div>
        <p class="card-body">${esc(c.caption)}</p>
        <div class="dgm-insight"><span>💡</span><span>${esc(c.insight)}</span></div>
        <span class="card-topic">#${esc(c.topic)}</span>
        ${srsRowHTML(c)}
        ${footerHTML(c)}
      </article>`);
    wireCard(node, c);
    return node;
  }

  function buildBarChart({ data, unit }) {
    const max = Math.max(...data.map(d => d.value));
    const bw = 210, rh = 40, h = data.length * rh + 6;
    let bars = "";
    data.forEach((d, i) => {
      const w = Math.max(6, (d.value / max) * bw);
      const y = i * rh + 6;
      const col = i % 2 ? "#7b2ff7" : "#ff3d7f";
      bars += `
        <text x="2" y="${y + 11}" class="bl">${esc(d.label)}</text>
        <rect x="2" y="${y + 17}" width="${bw}" height="11" rx="5.5" class="btrack"/>
        <rect x="2" y="${y + 17}" width="${w}" height="11" rx="5.5" fill="${col}"/>
        <text x="${w + 10}" y="${y + 26}" class="bv">${d.value}${unit || ""}</text>`;
    });
    return `<svg viewBox="0 0 320 ${h}" class="dgm">
      <style>.bl{fill:var(--text);font:700 11px Inter,system-ui,sans-serif}
        .bv{fill:var(--text-faint);font:700 11px Inter,system-ui,sans-serif}
        .btrack{fill:var(--border)}</style>${bars}</svg>`;
  }

  function paintRange(range) {
    const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
    range.style.background = `linear-gradient(90deg, var(--brand-1) 0%, var(--brand-2) ${pct}%, var(--border) ${pct}%)`;
  }

  /* ============================================================
     ACTIONS  (like / save / share / read)
     ============================================================ */
  function toggleLike(id, node) {
    const i = state.liked.indexOf(id);
    if (i >= 0) state.liked.splice(i, 1); else state.liked.push(id);
    save(LS.liked, state.liked);
    const c = cardById(id), liked = state.liked.includes(id), btn = node.querySelector(".like");
    btn.classList.toggle("liked", liked);
    btn.querySelector(".ico").textContent = liked ? "❤️" : "🤍";
    btn.querySelector(".cnt").textContent = fmt((c.likes || 0) + (liked ? 1 : 0));
    haptic([10]);
  }


  function markRead(id) {
    if (!state.read.includes(id)) { state.read.push(id); save(LS.read, state.read); }
  }

  /* ============================================================
     CREATOR STUDIO - 4-in-1 post creation with draft auto-save
     ============================================================ */
  const STUDIO_TYPES = {
    post:  { label: "New Post",           ico: "📝" },
    book:  { label: "Book",               ico: "📘" },
    link:  { label: "Web Link",           ico: "🔗" },
    media: { label: "YouTube / Podcast",  ico: "🎬" },
  };

  let studioState = { type: "post", draftId: null, fields: {} };
  let studioSaveTimer = null;

  function topicSelectHTML(id, current) {
    return `<select class="std-select" id="${id}">${TOPICS.map(t =>
      `<option value="${esc(t.name)}" ${current === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>`;
  }

  function openStudio(draftId) {
    if (draftId) {
      const d = state.drafts.find(x => x.id === draftId);
      if (d) studioState = { type: d.type, draftId: d.id, fields: { ...d.fields } };
    } else {
      studioState = { type: "post", draftId: null, fields: {} };
    }
    document.getElementById("studioBackdrop").hidden = false;
    paintStudioTabs();
    paintStudioForm();
    paintDraftsList();
  }
  function closeStudio() { document.getElementById("studioBackdrop").hidden = true; }

  function paintStudioTabs() {
    document.querySelectorAll("#studioTabs .studio-tab").forEach(t => t.classList.toggle("active", t.dataset.type === studioState.type));
  }

  function switchStudioType(type) {
    if (type === studioState.type) return;
    captureStudioFields();
    autosaveDraft(true);
    studioState = { type, draftId: null, fields: {} };
    paintStudioTabs();
    paintStudioForm();
    paintDraftsList();
  }

  function captureStudioFields() {
    const form = document.getElementById("studioForm");
    if (!form) return;
    form.querySelectorAll("[data-f]").forEach(el => { studioState.fields[el.dataset.f] = el.value; });
  }

  function paintStudioForm() {
    const form = document.getElementById("studioForm");
    const f = studioState.fields, type = studioState.type;
    const topic = f.topic || TOPICS[0].name;

    // PDF ingestion is a one-shot upload, not a draftable post - there's
    // nothing to Publish and nothing to autosave, so hide the chrome that
    // implies otherwise.
    const isIngest = type === "ingest";
    document.getElementById("studioPublish").hidden = isIngest;
    document.getElementById("studioSaveState").hidden = isIngest;
    document.getElementById("studioDrafts").hidden = isIngest;

    if (type === "ingest") {
      form.innerHTML = `
        <div class="ingest-panel">
          <label class="field"><span>Topic</span>${topicSelectHTML("stdIngestTopic", topic)}</label>
          <div class="pdf-dropzone" id="pdfDropzone" tabindex="0" role="button" aria-label="Upload a PDF to ingest">
            <input type="file" id="pdfFileInput" accept="application/pdf" hidden />
            <div class="pdf-dropzone-empty" id="pdfDropzoneEmpty">
              <div class="pdf-dropzone-ico">📄</div>
              <div class="pdf-dropzone-text">Drag &amp; drop a nonfiction book PDF here, or <span class="pdf-browse-link">browse</span></div>
              <div class="pdf-dropzone-sub">Supports .pdf up to 32MB</div>
            </div>
            <div class="pdf-file-chip" id="pdfFileChip" hidden>
              <span class="pdf-file-ico">📄</span>
              <div class="pdf-file-meta">
                <div class="pdf-file-name" id="pdfFileName"></div>
                <div class="pdf-file-size" id="pdfFileSize"></div>
              </div>
              <button class="pdf-file-remove" id="pdfFileRemove" type="button" aria-label="Remove file">✕</button>
            </div>
          </div>
          <button class="pill-btn ingest-start-btn" id="btnStartIngest" disabled>✨ Extract &amp; Generate Cards</button>
        </div>`;
      wireIngestPanel();
      return;
    }

    if (type === "book") {
      form.innerHTML = `
        <label class="field"><span>Book title</span><input data-f="bookTitle" value="${esc(f.bookTitle || "")}" placeholder="e.g. Atomic Habits" /></label>
        <label class="field"><span>Author</span><input data-f="author" value="${esc(f.author || "")}" placeholder="e.g. James Clear" /></label>
        <label class="field"><span>Chapter / rule number</span><input data-f="chapterRule" value="${esc(f.chapterRule || "")}" placeholder="e.g. Chapter 3" /></label>
        <label class="field"><span>Scenario description</span><textarea data-f="scenario" rows="4" placeholder="Describe the idea or scenario…">${esc(f.scenario || "")}</textarea></label>
        <label class="field"><span>AI visual prompt / image URL</span><input data-f="imageUrl" value="${esc(f.imageUrl || "")}" placeholder="Optional - a prompt or image link" /></label>
        <label class="field"><span>Topic</span>${topicSelectHTML("stdTopic", topic)}</label>`;
    } else if (type === "link") {
      form.innerHTML = `
        <label class="field"><span>Article / URL</span><input data-f="url" id="stdUrl" value="${esc(f.url || "")}" placeholder="https://…" /></label>
        <div class="studio-hint" id="stdParsePreview">${f.url ? "Detected source: " + esc(parsedHost(f.url)) : "We'll detect the source automatically once you paste a link."}</div>
        <label class="field"><span>Title</span><input data-f="title" value="${esc(f.title || "")}" placeholder="Article headline" /></label>
        <label class="field"><span>Key takeaway points</span><textarea data-f="takeaways" rows="4" placeholder="What's worth remembering?">${esc(f.takeaways || "")}</textarea></label>
        <label class="field"><span>Topic</span>${topicSelectHTML("stdTopic", topic)}</label>`;
    } else if (type === "media") {
      form.innerHTML = `
        <label class="field"><span>Video / audio episode link</span><input data-f="mediaUrl" value="${esc(f.mediaUrl || "")}" placeholder="https://youtube.com/… or podcast link" /></label>
        <label class="field"><span>Timestamp marker</span><input data-f="timestamp" value="${esc(f.timestamp || "")}" placeholder="e.g. 12:40" /></label>
        <label class="field"><span>Speaker / channel name</span><input data-f="speaker" value="${esc(f.speaker || "")}" placeholder="e.g. Huberman Lab" /></label>
        <label class="field"><span>Core insight summary</span><textarea data-f="insight" rows="4" placeholder="Summarise the key insight…">${esc(f.insight || "")}</textarea></label>
        <label class="field"><span>Topic</span>${topicSelectHTML("stdTopic", topic)}</label>`;
    } else {
      form.innerHTML = `
        <label class="field"><span>Title</span><input data-f="title" value="${esc(f.title || "")}" placeholder="A short, punchy headline" /></label>
        <label class="field"><span>Takeaway body text</span><textarea data-f="body" rows="4" placeholder="Explain the idea in a few sentences…">${esc(f.body || "")}</textarea></label>
        <label class="field"><span>Topic</span>${topicSelectHTML("stdTopic", topic)}</label>
        <label class="field">
          <span>Tags</span>
          <div class="tag-input-row" id="stdTagRow"></div>
          <input id="stdTagInput" placeholder="Type a tag and press Enter" />
        </label>`;
    }

    // the shared topic <select> carries no data-f (custom id) - mirror it manually
    const topicSel = form.querySelector("#stdTopic");
    if (topicSel) { topicSel.dataset.f = "topic"; }

    if (type === "post") { f.tags = f.tags || []; paintTagRow(); wireTagInput(); }
    if (type === "link") wireLinkPreview();

    wireStudioAutosave(form);
  }

  function parsedHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }
  function wireLinkPreview() {
    const input = document.getElementById("stdUrl");
    if (!input) return;
    input.addEventListener("blur", () => {
      const preview = document.getElementById("stdParsePreview");
      preview.textContent = input.value.trim() ? "Detected source: " + parsedHost(input.value.trim()) : "We'll detect the source automatically once you paste a link.";
    });
  }

  /* ============================================================
     AI PDF INGESTION - Creator Studio "Ingest PDF (AI)" tab
     Talks directly to the FastAPI backend (backend/main.py); everything
     else in Studio is a client-only demo, this is the one tab with a
     real server round-trip.
     ============================================================ */
  const INGEST_API_BASE = window.location.port === "8001" 
  ? window.location.origin 
  : "http://localhost:8001";
  const INGEST_MAX_BYTES = 32 * 1024 * 1024;

  const INGEST_STEPS = [
    "Extracting chapter chunks & text…",
    "Claude AI synthesizing mental models…",
    "Structuring 60% Core, 20% Sandboxes, 20% Diagrams…",
    "Indexing cards into database…",
  ];

  let selectedPdfFile = null;
  let ingestStepTimer = null;
  let ingestAbortController = null;

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function wireIngestPanel() {
    selectedPdfFile = null;
    const zone = document.getElementById("pdfDropzone");
    const input = document.getElementById("pdfFileInput");
    const emptyEl = document.getElementById("pdfDropzoneEmpty");
    const chipEl = document.getElementById("pdfFileChip");
    const startBtn = document.getElementById("btnStartIngest");

    function setFile(file) {
      if (!file) {
        selectedPdfFile = null;
        emptyEl.hidden = false; chipEl.hidden = true;
        startBtn.disabled = true;
        return;
      }
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) { toast("Please choose a PDF file."); return; }
      if (file.size > INGEST_MAX_BYTES) { toast("PDF is too large - max 32MB."); return; }

      selectedPdfFile = file;
      setText("pdfFileName", file.name);
      setText("pdfFileSize", fmtBytes(file.size));
      emptyEl.hidden = true; chipEl.hidden = false;
      startBtn.disabled = false;
    }

    zone.onclick = e => { if (!e.target.closest(".pdf-file-remove")) input.click(); };
    zone.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
    input.onchange = () => setFile(input.files[0]);

    ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); zone.classList.add("drag-over");
    }));
    ["dragleave", "dragend"].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); zone.classList.remove("drag-over");
    }));
    zone.addEventListener("drop", e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove("drag-over");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setFile(file);
    });

    document.getElementById("pdfFileRemove").onclick = e => { e.stopPropagation(); setFile(null); input.value = ""; };

    startBtn.onclick = () => {
      if (!selectedPdfFile) return;
      const topic = document.getElementById("stdIngestTopic").value;
      triggerPdfIngestion(selectedPdfFile, topic);
    };
  }

  // The app's sign-in flow (openOnboarding) is a client-only demo per the
  // notice in data.js - it never talks to the FastAPI backend, so it can't
  // hand back a real JWT. Until that's wired up, a real backend session
  // token (from POST /api/auth/login) can be dropped in manually for
  // testing: localStorage.setItem("ds_api_token", "<accessToken>").
  function getApiToken() {
    return (user && user.token) || localStorage.getItem("ds_api_token") || null;
  }

  function openIngestLoader() {
    document.getElementById("ingestLoader").hidden = false;
    setIngestStep(0);
    let i = 0;
    clearInterval(ingestStepTimer);
    ingestStepTimer = setInterval(() => {
      i = Math.min(i + 1, INGEST_STEPS.length - 1);
      setIngestStep(i);
    }, 7000); // cycle every 6–8s while we wait on the real response
  }

  function setIngestStep(idx) {
    document.querySelectorAll("#ingestSteps .ingest-step").forEach((el, i) => {
      el.classList.toggle("active", i === idx);
      el.classList.toggle("done", i < idx);
    });
  }

  function closeIngestLoader() {
    clearInterval(ingestStepTimer);
    ingestStepTimer = null;
    const loader = document.getElementById("ingestLoader");
    if (loader) loader.hidden = true;
  }

  // Merge a freshly-ingested Book + Flashcards into the live data.js arrays
  // (so bookById()/cardsForBook() see it immediately) and persist to
  // localStorage (so it survives a reload). Field names already match the
  // data.js BOOKS/FLASHCARDS schema - backend/main.py was written to mirror
  // them - plus the extra kind/interactiveData/svg fields the reader's
  // slider + diagram branches (see interactiveHTML) read.
  function mergeIngestedBook(book, cards) {
    const bookRecord = {
      id: book.id, title: book.title, author: book.author,
      coverColor: book.coverColor, coverImage: book.coverImage, glyph: book.glyph,
      year: book.year, minutes: book.minutes, topic: book.topic,
      relatedTopics: book.relatedTopics || [], similarBookIds: book.similarBookIds || [],
      description: book.description,
    };
    if (!BOOKS.some(b => b.id === bookRecord.id)) BOOKS.push(bookRecord);

    const cardRecords = cards.map(c => ({
      id: c.id, bookId: c.bookId, kind: c.kind,
      ruleNumberOrChapter: c.ruleNumberOrChapter, title: c.title, body: c.body, topic: c.topic,
      zeigarnikCliffhanger: c.zeigarnikCliffhanger, unlock: c.unlock,
      interactiveType: c.interactiveType, interactiveData: c.interactiveData,
      svg: c.svg, caption: c.caption, insight: c.insight, imageUrl: c.imageUrl,
    }));
    cardRecords.forEach(c => { if (!FLASHCARDS.some(x => x.id === c.id)) FLASHCARDS.push(c); });

    const stored = load(LS.ingested, { books: [], cards: [] });
    stored.books = stored.books.filter(b => b.id !== bookRecord.id).concat(bookRecord);
    stored.cards = stored.cards.filter(c => c.bookId !== bookRecord.id).concat(cardRecords);
    save(LS.ingested, stored);
  }

  async function triggerPdfIngestion(file, topic) {
    // Auth is optional: the backend accepts guest uploads (OptionalUser), so a
    // missing token sends the FormData unauthenticated rather than blocking.
    const token = getApiToken();
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast("Please choose a PDF file.");
      return;
    }
    if (file.size > INGEST_MAX_BYTES) {
      toast("PDF is too large - max 32MB.");
      return;
    }

    openIngestLoader();
    ingestAbortController = new AbortController();

    const fd = new FormData();
    fd.append("file", file);
    fd.append("topic", topic || "General");

    try {
      // Let the browser set Content-Type (it needs to add the multipart
      // boundary) - only Authorization is ours to add, and only if we have one.
      const res = await fetch(`${INGEST_API_BASE}/api/ingest/pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
        signal: ingestAbortController.signal,
      });

      if (!res.ok) {
        let message = `Ingestion failed (${res.status}).`;
        try { const err = await res.json(); if (err && err.detail) message = err.detail; } catch {}
        throw new Error(message);
      }

      const data = await res.json();
      mergeIngestedBook(data.book, data.cards || []);

      closeIngestLoader();
      closeStudio();

      const total = (data.cards || []).length;
      toast(`✨ "${data.book.title}" successfully ingested! ${total} card${total === 1 ? "" : "s"} generated.`);
      location.hash = "#/book/" + data.book.id;

    } catch (err) {
      closeIngestLoader();
      if (err.name === "AbortError") { toast("Ingestion cancelled."); return; }
      const offline = err instanceof TypeError; // fetch() throws TypeError on network failure
      toast(offline ? "Couldn't reach the ingestion API - is the backend running on :8001?" : (err.message || "Ingestion failed."));
    } finally {
      ingestAbortController = null;
    }
  }
  function paintTagRow() {
    const row = document.getElementById("stdTagRow");
    if (!row) return;
    row.innerHTML = (studioState.fields.tags || []).map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button data-i="${i}">✕</button></span>`).join("");
    row.querySelectorAll("button").forEach(b => b.onclick = () => {
      studioState.fields.tags.splice(parseInt(b.dataset.i, 10), 1);
      paintTagRow(); autosaveDraft();
    });
  }
  function wireTagInput() {
    const input = document.getElementById("stdTagInput");
    if (!input) return;
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        studioState.fields.tags.push(input.value.trim());
        input.value = "";
        paintTagRow(); autosaveDraft();
      }
    });
  }

  function wireStudioAutosave(form) {
    form.querySelectorAll("[data-f]").forEach(el => {
      const ev = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(ev, () => {
        clearTimeout(studioSaveTimer);
        studioSaveTimer = setTimeout(() => autosaveDraft(), 600);
        setText("studioSaveState", "Saving…");
      });
    });
  }

  function autosaveDraft(silent) {
    captureStudioFields();
    const f = studioState.fields;
    const hasContent = Object.values(f).some(v => Array.isArray(v) ? v.length : String(v || "").trim());
    if (!hasContent) { setText("studioSaveState", ""); return; }

    if (!studioState.draftId) studioState.draftId = "d" + Date.now();
    const idx = state.drafts.findIndex(d => d.id === studioState.draftId);
    const draft = { id: studioState.draftId, type: studioState.type, fields: { ...f }, updatedAt: Date.now() };
    if (idx >= 0) state.drafts[idx] = draft; else state.drafts.unshift(draft);
    save(LS.drafts, state.drafts);
    if (!silent) setText("studioSaveState", "Saved as draft · just now");
    paintDraftsList();
  }

  function paintDraftsList() {
    const host = document.getElementById("draftsList");
    if (!host) return;
    if (!state.drafts.length) { host.innerHTML = `<div class="drafts-empty">No drafts yet - anything you start typing autosaves here.</div>`; return; }
    host.innerHTML = "";
    state.drafts.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach(d => {
      const meta = STUDIO_TYPES[d.type] || STUDIO_TYPES.post;
      const titleGuess = d.fields.title || d.fields.bookTitle || d.fields.speaker || d.fields.body || "Untitled draft";
      const row = el(`
        <div class="draft-item">
          <div class="draft-thumb">${meta.ico}</div>
          <div class="draft-meta">
            <div class="draft-title">${esc(titleGuess.slice(0, 48))}</div>
            <div class="draft-sub">${meta.label} · ${timeAgo(d.updatedAt)}</div>
          </div>
          <div class="draft-actions">
            <button class="draft-edit" title="Resume editing">✎</button>
            <button class="draft-del" title="Delete draft">🗑</button>
          </div>
        </div>`);
      row.querySelector(".draft-edit").onclick = () => openStudio(d.id);
      row.querySelector(".draft-del").onclick = () => { deleteDraft(d.id); };
      host.appendChild(row);
    });
  }

  function deleteDraft(id) {
    state.drafts = state.drafts.filter(d => d.id !== id);
    save(LS.drafts, state.drafts);
    if (studioState.draftId === id) studioState = { type: studioState.type, draftId: null, fields: {} };
    paintDraftsList();
    haptic([10]);
  }

  function buildCardFromStudio(type, f) {
    const topic = f.topic || TOPICS[0].name;
    const base = { id: "u" + Date.now(), kind: "core", topic, coverColor: COVERS[Math.floor(Math.random() * COVERS.length)], likes: 0, saves: 0 };
    if (type === "book") {
      return { ...base, source: f.bookTitle || "Untitled book", type: "Book", author: f.author || "", cover: "📘",
        title: f.chapterRule || f.bookTitle || "Untitled idea", body: f.scenario || "",
        imageUrl: f.imageUrl || null,
        cliffhanger: "Your own scenario - worth revisiting after you finish the chapter.",
        unlock: f.scenario || "" };
    }
    if (type === "link") {
      const host = f.url ? parsedHost(f.url) : "";
      return { ...base, source: host || "Web article", type: "Link", author: "", cover: "🔗",
        title: f.title || "Untitled link", body: f.takeaways || "",
        cliffhanger: f.url ? `Read the source: ${f.url}` : "Saved from the web." };
    }
    if (type === "media") {
      return { ...base, source: f.speaker || "Video / Podcast", type: "Video/Podcast", author: f.speaker || "", cover: "🎬",
        title: (f.insight || "Untitled insight").slice(0, 70), body: f.insight || "",
        cliffhanger: f.timestamp ? `Jump to ${f.timestamp} in the original.` : "" };
    }
    return { ...base, source: "My notes", type: "Post", author: "You", cover: "✍",
      title: f.title || "Untitled idea", body: f.body || "",
      cliffhanger: (f.tags && f.tags.length) ? `Tags: ${f.tags.join(", ")}` : "You wrote this one - the payoff is whatever future-you needs to hear.",
      unlock: "Nicely done. Revisit it tomorrow and see if it still rings true." };
  }

  function publishStudio() {
    captureStudioFields();
    const type = studioState.type, f = studioState.fields;
    const requiredOk = type === "post" ? (f.title && f.body)
      : type === "book" ? (f.bookTitle && f.scenario)
      : type === "link" ? (f.url && f.takeaways)
      : (f.mediaUrl && f.insight);
    if (!requiredOk) { toast("Fill in the required fields before publishing"); return; }

    const c = buildCardFromStudio(type, f);
    state.custom.unshift(c);
    save(LS.custom, state.custom);
    if (!state.saved.includes(c.id)) { state.saved.push(c.id); save(LS.saved, state.saved); updateSavedCount(); }
    if (studioState.draftId) deleteDraft(studioState.draftId);
    updateDue();
    closeStudio();
    toast("Published to your feed ✨");
    if (["/home", "/profile", "/saved"].includes(currentRoute().base)) router();
  }

  /* ============================================================
     SETTINGS MODAL - Personal / Preferences / Email / Export
     ============================================================ */
  let settingsTab = "personal";
  function openSettings() {
    settingsTab = "personal";
    document.getElementById("settingsBackdrop").hidden = false;
    paintSettingsTabs();
    paintSettingsBody();
  }
  function closeSettings() { document.getElementById("settingsBackdrop").hidden = true; }
  function paintSettingsTabs() {
    document.querySelectorAll("#settingsTabs .studio-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === settingsTab));
  }

  function paintSettingsBody() {
    const body = document.getElementById("settingsBody");
    const p = user.profile;

    if (settingsTab === "preferences") {
      body.innerHTML = `
        <label class="field"><span>Daily reading pace</span>
          <select class="std-select" id="setPace">${PACE_OPTIONS.map(o => `<option value="${o.id}" ${p.dailyPace === o.id ? "selected" : ""}>${o.label} - ${o.desc}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Primary growth areas</span>
          <div class="pill-grid-select" id="setGrowth">
            ${GROWTH_AREAS.map(g => `<button type="button" class="pill-card ${p.growthAreas.includes(g.id) ? "active" : ""}" data-v="${g.id}"><span class="pc-ico">${g.ico}</span>${esc(g.label)}</button>`).join("")}
          </div>
        </label>
        <div class="settings-row">
          <div class="field"><span>Notifications</span></div>
          <button class="toggle ${p.notifyEnabled ? "on" : ""}" id="setNotify"></button>
        </div>
        <div class="modal-foot"><button class="pill-btn" id="setSavePrefs">Save preferences</button></div>`;
      document.getElementById("setGrowth").onclick = (e) => {
        const b = e.target.closest(".pill-card"); if (!b) return;
        const arr = p.growthAreas, i = arr.indexOf(b.dataset.v);
        if (i >= 0) arr.splice(i, 1); else arr.push(b.dataset.v);
        b.classList.toggle("active");
      };
      document.getElementById("setNotify").onclick = (e) => { p.notifyEnabled = !p.notifyEnabled; e.target.classList.toggle("on", p.notifyEnabled); };
      document.getElementById("setSavePrefs").onclick = () => {
        p.dailyPace = document.getElementById("setPace").value;
        saveUser(); toast("Preferences saved ✓");
      };
    } else if (settingsTab === "email") {
      body.innerHTML = `
        <label class="field"><span>Email</span><input id="setEmail" type="email" value="${esc(p.email)}" /></label>
        <label class="field"><span>New password</span><input id="setPass" type="password" placeholder="Leave blank to keep current" /></label>
        <p class="wiz-error" id="setEmailErr" hidden></p>
        <div class="modal-foot"><button class="pill-btn" id="setSaveEmail">Update account</button></div>`;
      document.getElementById("setSaveEmail").onclick = () => {
        const newEmail = document.getElementById("setEmail").value.trim();
        const newPass = document.getElementById("setPass").value;
        const err = document.getElementById("setEmailErr");
        if (!/^\S+@\S+\.\S+$/.test(newEmail)) { err.textContent = "Enter a valid email address."; err.hidden = false; return; }
        const accounts = loadAccounts();
        const oldEmail = p.email;
        if (oldEmail && accounts[oldEmail] && newEmail !== oldEmail) {
          accounts[newEmail] = accounts[oldEmail];
          delete accounts[oldEmail];
        }
        if (newEmail && !accounts[newEmail]) accounts[newEmail] = { password: newPass || "changeme", userSnapshot: null };
        if (newPass && accounts[newEmail]) accounts[newEmail].password = newPass;
        saveAccounts(accounts);
        p.email = newEmail;
        saveUser();
        toast("Account updated ✓");
        err.hidden = true;
      };
    } else if (settingsTab === "export") {
      body.innerHTML = `
        <p class="wiz-sub" style="text-align:left">Export every idea you've saved as Markdown or JSON.</p>
        <div class="export-actions">
          <button class="btn-secondary" id="exportMd">⬇ Markdown</button>
          <button class="btn-secondary" id="exportJson">⬇ JSON</button>
        </div>`;
      document.getElementById("exportMd").onclick = () => exportLibrary("md");
      document.getElementById("exportJson").onclick = () => exportLibrary("json");
    } else {
      body.innerHTML = `
        <label class="field"><span>First name</span><input id="setFirst" value="${esc(p.firstName)}" /></label>
        <label class="field"><span>Last name</span><input id="setLast" value="${esc(p.lastName)}" /></label>
        <label class="field"><span>Phone</span><input id="setPhone" value="${esc(p.phone)}" /></label>
        <label class="field"><span>Bio</span><textarea id="setBio" rows="3">${esc(p.bio)}</textarea></label>
        <label class="field"><span>Profile image URL</span><input id="setAvatarUrl" value="${esc(p.avatarUrl)}" placeholder="https://…" /></label>
        <div class="modal-foot"><button class="pill-btn" id="setSavePersonal">Save changes</button></div>`;
      document.getElementById("setSavePersonal").onclick = () => {
        p.firstName = document.getElementById("setFirst").value.trim();
        p.lastName = document.getElementById("setLast").value.trim();
        p.phone = document.getElementById("setPhone").value.trim();
        p.bio = document.getElementById("setBio").value.trim();
        p.avatarUrl = document.getElementById("setAvatarUrl").value.trim();
        saveUser();
        toast("Profile updated ✓");
      };
    }
  }

  function exportLibrary(format) {
    const items = state.saved.map(cardById).filter(Boolean);
    let text, mime, filename;
    if (format === "json") {
      text = JSON.stringify(items, null, 2); mime = "application/json"; filename = "synapse-library.json";
    } else {
      text = items.map(c => `## ${c.title}\n\n${c.body || c.prompt || c.caption || ""}\n\n_Source: ${c.source || ""}_\n`).join("\n---\n\n");
      mime = "text/markdown"; filename = "synapse-library.md";
    }
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
    toast(`Exported ${items.length} ideas as ${format.toUpperCase()} ⬇`);
  }

  /* ============================================================
     NOTIFICATIONS + HELP CENTER
     ============================================================ */
  function toggleNotifPanel() {
    const panel = document.getElementById("notifPanel");
    const opening = panel.hidden;
    panel.hidden = !opening;
    if (opening) paintNotifList();
  }
  function paintNotifList() {
    const host = document.getElementById("notifList");
    if (!state.notifications.length) { host.innerHTML = `<div class="notif-empty">You're all caught up.</div>`; return; }
    host.innerHTML = state.notifications.map(n => `
      <div class="notif-row ${n.read ? "" : "unread"}${n.urgent ? " urgent" : ""}" data-id="${n.id}">
        <span class="notif-ico">${n.ico}</span>
        <div><div class="notif-title">${esc(n.title)}</div><div class="notif-body">${esc(n.body)}</div><div class="notif-time">${esc(n.time)}</div></div>
      </div>`).join("");
    state.notifications.forEach(n => (n.read = true));
    save(LS.notifications, state.notifications);
    refreshTopbarChrome();
  }

  function openHelp() {
    document.getElementById("helpBackdrop").hidden = false;
    const host = document.getElementById("helpFaq");
    host.innerHTML = FAQS.map((f, i) => `
      <div class="faq-item" data-i="${i}">
        <button class="faq-q" aria-expanded="false">${esc(f.q)}<span class="faq-mark">＋</span></button>
        <div class="faq-a"><div class="faq-a-inner"><p>${esc(f.a)}</p></div></div>
      </div>`).join("");
    host.querySelectorAll(".faq-item").forEach(item => {
      const btn = item.querySelector(".faq-q");
      btn.onclick = () => { const open = item.classList.toggle("open"); btn.setAttribute("aria-expanded", open ? "true" : "false"); };
    });
  }
  function closeHelp() { document.getElementById("helpBackdrop").hidden = true; }

  /* ============================================================
     PROFILE DROPDOWN + SIGN OUT
     ============================================================ */
  function toggleProfilePanel() {
    const panel = document.getElementById("profilePanel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refreshTopbarChrome();
  }
  function closeProfilePanel() { document.getElementById("profilePanel").hidden = true; }

  function signOut() {
    user = createGuestUser();
    saveUser();
    localStorage.removeItem("ds_api_token");
    closeProfilePanel();
    toast("Signed out");
    location.hash = "#/";
  }

  /* ============================================================
     UI HELPERS
     ============================================================ */
  const DAY_MS = 86400000;

  function updateSavedCount() { document.getElementById("savedCount").textContent = state.saved.length; }

  function updateDue() {
    if (!window.SRS) return;
    const { due, fresh } = SRS.counts(allCards().map(c => c.id));
    const numEl = document.getElementById("dueNum"), lblEl = document.getElementById("dueLabel"), row = document.getElementById("dueRow");
    if (!numEl) return;
    const total = due + fresh;
    numEl.textContent = total;
    lblEl.textContent = due > 0
      ? `due now · ${fresh} new`
      : fresh > 0 ? "new cards to learn" : "all caught up 🎉";
    if (row) row.classList.toggle("caught", total === 0);
  }

  function fmtDays(n) {
    if (n < 1) return "<1d";
    if (n >= 365) return (n / 365).toFixed(1).replace(/\.0$/, "") + "y";
    if (n >= 30) return Math.round(n / 30) + "mo";
    return n + "d";
  }
  function relTime(ms) {
    const d = Math.round((ms - Date.now()) / DAY_MS);
    return d <= 0 ? "now" : "in " + fmtDays(d);
  }
  function timeAgo(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return fmtDays(Math.round(s / 86400)) + " ago";
  }
  /* ============================================================
     FOCUS ENGINE - stamina meter, brain-rewire level, exit friction
     ------------------------------------------------------------
     "Deep focus" = wall-clock seconds where the tab is visible AND
     the reader has interacted within IDLE_MS. This counts real time
     spent on cards & sandboxes, not swipes or card-counts.
     ============================================================ */
  const FOCUS_TARGET = 900;   // seconds of deep focus == 100% stamina (15 min)
  const IDLE_MS = 45000;      // no interaction for this long → not focusing
  const LEVELS = [
    { min: 0,  name: "Passive Swiper",  ico: "🌫️" },
    { min: 3,  name: "Curious Skimmer", ico: "🌱" },
    { min: 7,  name: "Active Learner",  ico: "⚡" },
    { min: 12, name: "Deep Reader",     ico: "🧠" },
  ];

  let focus = loadFocus();
  let lastActivity = Date.now();
  let focusPaused = false, modalShown = false, holdRAF = null;
  let lastLevelIdx = levelIndex(focus.total);
  let milestoneNotified = false; // resets each time a session cycle restarts

  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function loadFocus() {
    const f = load(LS.focus, null);
    return (!f || f.date !== todayKey()) ? { date: todayKey(), total: 0, session: 0 } : f;
  }
  function saveFocus() { save(LS.focus, focus); }
  function levelIndex(totalSec) {
    const mins = totalSec / 60; let idx = 0;
    LEVELS.forEach((l, i) => { if (mins >= l.min) idx = i; });
    return idx;
  }

  function startFocusEngine() {
    // Any of these interactions marks the reader as actively engaged.
    ["pointerdown", "keydown", "wheel", "touchstart", "pointermove"].forEach(ev =>
      window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
    window.addEventListener("scroll", () => (lastActivity = Date.now()), { passive: true, capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") lastActivity = Date.now();
    });

    document.getElementById("fxClose").onclick = closeApp;
    document.getElementById("fxReopen").onclick = reopenFeed;
    wireHoldToContinue(document.getElementById("fxContinue"));

    updateFocusUI();
    setInterval(focusTick, 1000);
  }

  function focusTick() {
    if (isGuest()) return;   // reading timer is a signed-in feature only
    if (focusPaused || modalShown) return;
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastActivity > IDLE_MS) return;   // idle → doesn't count

    focus.total++; focus.session++;
    if (focus.total % 5 === 0) saveFocus();

    const idx = levelIndex(focus.total);
    if (idx > lastLevelIdx) { lastLevelIdx = idx; onLevelUp(idx); }
    updateFocusUI();

    if (focus.session >= FOCUS_TARGET) {
      openFocusExit();
      if (!milestoneNotified) { milestoneNotified = true; injectFocusMilestoneNotification(); }
    }
  }

  // 100% Focus Stamina → surface a persistent notification nudging the
  // reader toward the real book, on top of the full-screen Focus Exit.
  function injectFocusMilestoneNotification() {
    const book = pickReading().book;
    const n = {
      id: "n-milestone-" + Date.now(),
      ico: "📖",
      title: "Focus Stamina at 100%",
      body: `Now your reading streak is at 100%. Close the website and go read the real book: ${book}.`,
      time: "Just now",
      read: false,
      urgent: true,
    };
    state.notifications.unshift(n);
    save(LS.notifications, state.notifications);
    refreshTopbarChrome();
    toast(`🔔 100% focus stamina - go read ${book}!`);
  }

  function onLevelUp(idx) {
    haptic([20, 40, 20]);
    toast(`🧠 Brain rewired - Level ${idx + 1}: ${LEVELS[idx].name}`);
    const badge = document.getElementById("rewireBadge");
    if (badge) { badge.classList.remove("pulse"); void badge.offsetWidth; badge.classList.add("pulse"); }
  }

  function updateFocusUI() {
    const pct = Math.min(100, Math.round((focus.session / FOCUS_TARGET) * 100));
    const fill = document.getElementById("staminaFill"), head = document.getElementById("staminaMin");
    if (fill) fill.style.width = pct + "%";
    if (head) head.textContent = `${Math.floor(focus.session / 60)} / 15 min`;

    const idx = levelIndex(focus.total), cur = LEVELS[idx], next = LEVELS[idx + 1];
    setText("rewireIco", cur.ico);
    setText("rewireLevel", `Lv ${idx + 1} · ${cur.name}`);
    setText("rewireNext", next
      ? `${Math.max(1, Math.ceil(next.min - focus.total / 60))} min to ${next.name}`
      : "Max level reached 🏆");
  }

  // Recommend a real book the reader has engaged with, plus a location.
  function pickReading() {
    const engaged = CORE_CARDS.filter(c => c.type === "Book" &&
      (state.liked.includes(c.id) || state.saved.includes(c.id) || (window.SRS && SRS.get(c.id))));
    const pool = engaged.length ? engaged : CORE_CARDS.filter(c => c.type === "Book");
    const c = pool[Math.floor(Math.random() * pool.length)] || CORE_CARDS[0];
    return { book: c.source, chapter: 2 + Math.floor(Math.random() * 8), page: 20 + Math.floor(Math.random() * 12) * 10 };
  }

  function openFocusExit() {
    if (modalShown) return;
    modalShown = true; focusPaused = true;       // pause the feed clock
    const r = pickReading();
    setText("fxBook", r.book);
    setText("fxLoc", `Chapter ${r.chapter} · Page ${r.page}`);
    setText("fxByeBook", r.book);
    document.getElementById("fxMain").hidden = false;
    document.getElementById("fxBye").hidden = true;
    document.getElementById("focusExit").hidden = false;
    document.body.classList.add("focus-locked");
    haptic([30, 60, 30]);
  }

  // Low-friction: close and go read. (window.close only works for
  // script-opened tabs; otherwise the calm "go read" bridge remains.)
  function closeApp() {
    document.getElementById("fxMain").hidden = true;
    document.getElementById("fxBye").hidden = false;
    try { window.close(); } catch {}
  }

  function reopenFeed() { dismissExit(); }

  // High-friction "continue anyway" also RESETS stamina to zero - you
  // don't get to keep your 100% and keep scrolling.
  function continueAnyway() {
    dismissExit();
    toast("New 15-minute block started - go deep 🎯");
  }

  function dismissExit() {
    focus.session = 0; modalShown = false; focusPaused = false; milestoneNotified = false; saveFocus();
    document.getElementById("focusExit").hidden = true;
    document.body.classList.remove("focus-locked");
    updateFocusUI();
  }

  // Press-and-hold for 3s - the deliberate friction on "continue".
  function wireHoldToContinue(btn) {
    if (!btn) return;
    const fillEl = btn.querySelector(".fx-hold");
    const HOLD = 3000;
    let start = 0, active = false;
    const step = (t) => {
      if (!active) return;
      if (!start) start = t;
      const p = Math.min(1, (t - start) / HOLD);
      fillEl.style.width = (p * 100) + "%";
      if (p >= 1) { stop(); continueAnyway(); return; }
      holdRAF = requestAnimationFrame(step);
    };
    const begin = (e) => { e.preventDefault(); active = true; start = 0; haptic([10]); holdRAF = requestAnimationFrame(step); };
    const stop = () => { active = false; if (holdRAF) cancelAnimationFrame(holdRAF); fillEl.style.width = "0%"; };
    btn.addEventListener("pointerdown", begin);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  }

  function setText(id, t) { const e = document.getElementById(id); if (e) e.textContent = t; }
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove("show"), 1900); }

  function matchQuery(list, q) {
    q = q.toLowerCase();
    const has = (s) => (s || "").toLowerCase().includes(q);
    return list.filter(c => has(c.title) || has(c.body) || has(c.prompt) || has(c.source) || has(c.topic) || has(c.author) || has(c.cliffhanger) || has(c.caption) || has(c.insight));
  }

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    save(LS.theme, t);
    const dark = t === "dark";
    document.getElementById("themeIco").textContent = dark ? "☀️" : "🌙";
    document.getElementById("themeLabel").textContent = dark ? "Light mode" : "Dark mode";
    setText("ppThemeIco", dark ? "☀️" : "🌙");
    setText("ppThemeLabel", dark ? "Light mode" : "Dark mode");
  }

  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n); }

  /* ============================================================
     INIT
     ============================================================ */
  /* ============================================================
     BACKEND SYNC - synapse.db is the source of truth
     ------------------------------------------------------------
     Order of preference for every piece of public content:

       1. FastAPI  (http://localhost:8001/api)   - authoritative
       2. IndexedDB (window.Cache)               - last good copy
       3. data.js seeds                          - cold-start floor

     Everything the server returns is merged into the live BOOKS /
     FLASHCARDS / SEED_CARDS arrays by id, so every existing renderer
     keeps working untouched, and mirrored into IndexedDB so the next
     offline boot looks identical.

     PRIVACY: only books, cards, stashes and comments are written to
     IndexedDB. The bearer token is read from getApiToken() and used
     for the Authorization header only - see the boundary note at the
     top of db.js.
     ============================================================ */

  const API_BASE = INGEST_API_BASE + "/api";
  const API_TIMEOUT_MS = 8000;

  // Flipped by the first successful/failed call; drives the offline banner
  // and lets write paths fall back to localStorage without a round trip.
  let backendOnline = false;

  async function apiFetch(path, opts) {
    opts = opts || {};
    const token = getApiToken();
    const headers = Object.assign({}, opts.headers);
    if (token) headers.Authorization = "Bearer " + token;
    if (opts.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || API_TIMEOUT_MS);
    try {
      const res = await fetch(API_BASE + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      backendOnline = true;
      if (!res.ok) {
        let detail = "Request failed (" + res.status + ").";
        try { const j = await res.json(); if (j && j.detail) detail = j.detail; } catch {}
        const err = new Error(detail);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : await res.json();
    } catch (e) {
      // A non-HTTP failure (abort, DNS, connection refused) means the backend
      // is unreachable; an HTTP error means it answered and we stay "online".
      if (e.status == null) backendOnline = false;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- wire shape -> data.js shape ---------- */

  function mapApiBook(b) {
    return {
      id: b.id, title: b.title, author: b.author || "",
      coverColor: b.coverColor || "#7b2ff7", coverImage: b.coverImage || null,
      glyph: b.glyph || "📘", year: b.year != null ? b.year : null,
      minutes: b.minutes || 8, topic: b.topic || "",
      relatedTopics: b.relatedTopics || [], similarBookIds: b.similarBookIds || [],
      description: b.description || "",
    };
  }

  // Rebuilds the compute() closure data.js used to ship, from the AST-safe
  // formula the server validated (backend/ai_ingestion.validate_formula).
  // evalSafeFormula re-parses it here rather than trusting the server's word.
  function makeCompute(cfg) {
    return function (v) {
      let result = null;
      try { result = evalSafeFormula(cfg.formula, v); } catch {}
      if (result == null) {
        return { main: "-", sub: cfg.resultLabel || "", verdict: "Couldn't compute this one.", tone: "neutral" };
      }
      const rounded = Math.abs(result) >= 10 ? Math.round(result) : Math.round(result * 100) / 100;
      // Sign outside the prefix so a currency reads "−$30", not "$-30".
      const sign = rounded < 0 ? "−" : (cfg.showPlus ? "+" : "");
      const main = sign + (cfg.resultPrefix || "") + Math.abs(rounded) + (cfg.resultSuffix || "");

      let tone = "neutral", verdict = cfg.verdicts && cfg.verdicts.neutral;
      if (cfg.badBelow != null && result <= cfg.badBelow) { tone = "bad"; verdict = cfg.verdicts && cfg.verdicts.bad; }
      else if (cfg.goodAbove != null && result >= cfg.goodAbove) { tone = "good"; verdict = cfg.verdicts && cfg.verdicts.good; }

      return { main, sub: cfg.resultLabel || "", verdict: verdict || "", tone };
    };
  }

  // One card object carrying BOTH shapes: the FLASHCARDS fields the book
  // reader reads, and the SEED_CARDS fields the feed renderers read. Cheaper
  // and far less error-prone than keeping two parallel records per card.
  function mapApiCard(c) {
    const rec = {
      id: c.id, bookId: c.bookId, kind: c.kind || "core",
      // --- book-card shape ---
      ruleNumberOrChapter: c.ruleNumberOrChapter || "",
      title: c.title || "", body: c.body || "", topic: c.topic || "",
      zeigarnikCliffhanger: c.zeigarnikCliffhanger || "",
      unlock: c.unlock || "",
      interactiveType: c.interactiveType || null,
      interactiveData: c.interactiveData || null,
      svg: c.svg || null, caption: c.caption || "", insight: c.insight || "",
      imageUrl: c.imageUrl || null,
      likes: c.likes || 0, saves: c.saves || 0,
      // --- feed-card shape ---
      source: c.source || "", author: c.author || "",
      cover: c.cover || "📖", coverColor: c.coverColor || "#7b2ff7",
      type: c.ruleNumberOrChapter || (c.kind === "diagram" ? "Visual model" : "Key idea"),
      cliffhanger: c.zeigarnikCliffhanger || "",
      prompt: c.body || "",
    };

    if (rec.kind === "sandbox") {
      const d = rec.interactiveData;
      if (d && rec.interactiveType === "slider" && d.slider) {
        rec.mode = "slider";
        rec.slider = d.slider;
        rec.compute = makeCompute(d);
      } else if (d && d.nodes && d.start) {
        rec.mode = "choice";
        rec.start = d.start;
        rec.nodes = d.nodes;
      } else {
        // No usable interaction payload - render it as a plain idea rather
        // than handing buildChoice an undefined node map.
        rec.kind = "core";
      }
    }
    return rec;
  }

  function mapApiStash(s) {
    return {
      id: s.id, title: s.title, desc: s.description || "",
      emoji: s.emoji || "📚", color: s.color || "#7b2ff7",
      cardIds: (s.cardIds || []).slice(),
      created: s.createdAt || Date.now(),
      owned: !!s.owned, remote: true,
    };
  }

  // Accepts either wire (`createdAt`) or cached (`ts`) timestamps.
  function mapApiComment(c, cardId) {
    return {
      id: c.id, cardId: c.cardId || cardId,
      author: c.author || "Anonymous", avatar: c.avatar || "?",
      color: c.color || "#7b2ff7", text: c.text || "",
      likes: c.likes || 0, parentId: c.parentId != null ? c.parentId : null,
      ts: c.createdAt != null ? c.createdAt : (c.ts || Date.now()),
    };
  }

  // GET /api/cards/:id/comments returns top-level threads with nested
  // `replies`; the drawer renders from a flat list, so flatten on the way in.
  function flattenThreads(threads, cardId) {
    const out = [];
    (function walk(list, parentId) {
      (list || []).forEach(c => {
        if (!c || !c.id) return;
        const rec = mapApiComment(c, cardId);
        if (rec.parentId == null) rec.parentId = parentId || null;
        out.push(rec);
        walk(c.replies, c.id);
      });
    })(threads, null);
    return out;
  }

  /* ---------- merge into the live arrays ---------- */

  function upsertBooks(books) {
    books.forEach(b => {
      const i = BOOKS.findIndex(x => x.id === b.id);
      if (i === -1) {
        BOOKS.push(b);
      } else {
        const existingCover = BOOKS[i].coverImage;
        BOOKS[i] = Object.assign({}, BOOKS[i], b);
        // Backend එකෙන් coverImage එක null හෝ හිස්ව ආවොත්, කලින් තිබූ cover එක ආරක්ෂා කරගන්න
        if ((!BOOKS[i].coverImage || String(BOOKS[i].coverImage).trim() === "") && existingCover) {
          BOOKS[i].coverImage = existingCover;
        }
      }
    });
  }

  // A card lands in FLASHCARDS (book reader) and SEED_CARDS (feed pools) both:
  // allCards() de-dupes, so the same object is simply reachable from either.
  function upsertCards(cards) {
    cards.forEach(c => {
      const i = FLASHCARDS.findIndex(x => x.id === c.id);
      if (i === -1) FLASHCARDS.push(c); else FLASHCARDS[i] = c;
      const j = SEED_CARDS.findIndex(x => x.id === c.id);
      if (j === -1) SEED_CARDS.push(c); else SEED_CARDS[j] = c;
    });
  }

  /* ---------- stash state ----------
     remoteStashes mirrors /api/stashes (or its IndexedDB copy).
     customStashes stays as the offline-only store for stashes created while
     the backend was unreachable; they are shadowed once the server knows
     about them. allStashes() is what every renderer reads.               */
  let remoteStashes = [];

  function allStashes() {
    const seeds = (!remoteStashes.length && typeof SEED_STASHES !== "undefined") ? SEED_STASHES : [];
    const known = new Set(remoteStashes.map(s => s.id));
    const locals = customStashes.filter(s => !known.has(s.id));
    const seedExtras = seeds.filter(s => !known.has(s.id) && !locals.some(l => l.id === s.id))
      .map(s => ({ id: s.id, title: s.title, desc: s.description || "", emoji: s.ico || "📚",
                   color: s.color || "#7b2ff7", cardIds: (s.cardIds || []).slice(),
                   created: s.createdAt || Date.now(), owned: false }));
    return remoteStashes.concat(locals, seedExtras);
  }

  function stashById(id) { return allStashes().find(s => s.id === id); }

  /* ---------- comment state ----------
     Kept in memory so footerHTML() can render a comment count synchronously
     during paint. Warmed from IndexedDB at boot, replaced per card by the
     drawer's live fetch.                                                  */
  const commentCache = new Map();   // cardId -> flat comment[]

  function _seedCommentsFor(cardId) {
    const seed = typeof commentsForCard === "function" ? commentsForCard(cardId) : [];
    return seed.map(c => mapApiComment(c, cardId));
  }

  /* ---------- boot hydration ---------- */

  async function hydrateBooks() {
    try {
      const books = await apiFetch("/books?limit=200");
      const mapped = (books || []).map(mapApiBook);
      if (!mapped.length) return false;
      upsertBooks(mapped);
      Cache.cacheBooks(mapped);
      return true;
    } catch { return false; }
  }

  async function hydrateFeed() {
    try {
      const data = await apiFetch("/feed?limit=100");
      const mapped = (data && data.items || []).map(mapApiCard);
      if (!mapped.length) return false;
      upsertCards(mapped);
      // Cache the plain data, not the object with its compute() closure -
      // functions don't survive structured clone.
      Cache.cacheFlashcards((data.items || []).map(stripCardForCache));
      // Server SM-2 state wins: it follows the account across devices.
      if (window.SRS && SRS.hydrate) {
        (data.items || []).forEach(c => { if (c.srs) SRS.hydrate(c.id, c.srs); });
      }
      return true;
    } catch { return false; }
  }

  async function hydrateStashes() {
    try {
      const list = await apiFetch("/stashes");
      remoteStashes = (list || []).map(mapApiStash);
      // Replace, don't merge - see the note in db.js.
      await Cache.replaceStashes(list || []);
      return true;
    } catch { return false; }
  }

  // IndexedDB stores the wire record verbatim; drop the SRS block, which is
  // per-user state that belongs in the `cards` store, not the content mirror.
  function stripCardForCache(c) {
    const copy = Object.assign({}, c);
    delete copy.srs;
    return copy;
  }

  async function hydrateFromCache() {
    if (!window.Cache) return;
    const [books, cards, stashes] = await Promise.all([
      Cache.getCachedBooks(), Cache.getCachedFlashcards(), Cache.getCachedStashes(),
    ]);
    if (books.length) upsertBooks(books.map(mapApiBook));
    if (cards.length) upsertCards(cards.map(mapApiCard));
    if (stashes.length) remoteStashes = stashes.map(mapApiStash);
  }

  // Warm the in-memory comment map so card footers show real counts on the
  // very first paint, online or off. One read of the whole store, grouped by
  // card - the drawer replaces a card's entry with live data when it opens.
  async function warmCommentCache() {
    if (!window.Cache || !Cache.getAllCachedComments) return;
    let rows = [];
    try { rows = await Cache.getAllCachedComments(); } catch { return; }
    const grouped = new Map();
    rows.forEach(r => {
      if (!r || !r.cardId) return;
      if (!grouped.has(r.cardId)) grouped.set(r.cardId, []);
      grouped.get(r.cardId).push(mapApiComment(r, r.cardId));
    });
    grouped.forEach((list, cardId) => commentCache.set(cardId, list));
  }

  /* Boot sequence: try the network, fall back to the cache, always render. */
  async function bootstrapData() {
    if (!window.Cache) return;
    await Cache.ready;

    // Fill from the last known-good copy first so a slow network never shows
    // an empty shelf, then let the live data overwrite it.
    await hydrateFromCache();
    await warmCommentCache();

    const results = await Promise.all([hydrateBooks(), hydrateFeed(), hydrateStashes()]);
    if (!results.some(Boolean)) {
      console.info("[synapse] backend unreachable - running from IndexedDB + data.js seeds.");
    }
  }

  // Book detail pages need every card of that book, not just the slice the
  // daily feed happened to return. Fires once per book, then merges + caches.
  const _hydratedBooks = new Set();
  async function hydrateBookCards(bookId) {
    if (!bookId || _hydratedBooks.has(bookId)) return false;
    _hydratedBooks.add(bookId);
    try {
      const data = await apiFetch("/books/" + encodeURIComponent(bookId));
      const cards = (data && data.cards) || [];
      if (!cards.length) return false;
      upsertBooks([mapApiBook(data)]);
      upsertCards(cards.map(mapApiCard));
      Cache.cacheFlashcards(cards.map(stripCardForCache));
      if (window.SRS && SRS.hydrate) cards.forEach(c => { if (c.srs) SRS.hydrate(c.id, c.srs); });
      return true;
    } catch {
      _hydratedBooks.delete(bookId);   // let a later visit retry
      return false;
    }
  }

  function init() {
    applyTheme(load(LS.theme, "light"));
    updateSavedCount();
    startFocusEngine();

    window.addEventListener("hashchange", router);
    document.getElementById("themeToggle").onclick = () =>
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

    const si = document.getElementById("searchInput");
    let deb;
    si.addEventListener("input", e => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        state.query = e.target.value.trim();
        if (state.query && currentRoute().path !== "/saved") { if (location.hash !== "#/home") location.hash = "#/home"; else router(); }
        else router();
      }, 220);
    });

    document.getElementById("createBtn").onclick = () => openStudio();
    document.getElementById("bnCreate").onclick = e => { e.preventDefault(); openStudio(); };

    // Creator Studio
    const studioBackdrop = document.getElementById("studioBackdrop");
    document.getElementById("studioClose").onclick = closeStudio;
    document.getElementById("studioCancel").onclick = closeStudio;
    document.getElementById("studioPublish").onclick = publishStudio;
    studioBackdrop.onclick = e => { if (e.target === studioBackdrop) closeStudio(); };
    document.querySelectorAll("#studioTabs .studio-tab").forEach(t => t.onclick = () => switchStudioType(t.dataset.type));

    // PDF ingestion loader - cancel aborts the in-flight request; the fetch's
    // catch block handles closing the overlay and toasting once it observes
    // the AbortError.
    document.getElementById("ingestCancel").onclick = () => {
      if (ingestAbortController) ingestAbortController.abort();
      else closeIngestLoader();
    };

    // Settings modal
    const settingsBackdrop = document.getElementById("settingsBackdrop");
    document.getElementById("settingsClose").onclick = closeSettings;
    settingsBackdrop.onclick = e => { if (e.target === settingsBackdrop) closeSettings(); };
    document.querySelectorAll("#settingsTabs .studio-tab").forEach(t => t.onclick = () => { settingsTab = t.dataset.tab; paintSettingsTabs(); paintSettingsBody(); });

    // Follow / followers modal
    const followBackdrop = document.getElementById("followBackdrop");
    document.getElementById("followClose").onclick = closeFollowModal;
    followBackdrop.onclick = e => { if (e.target === followBackdrop) closeFollowModal(); };
    document.querySelectorAll("#followTabs .studio-tab").forEach(t => t.onclick = () => {
      document.querySelectorAll("#followTabs .studio-tab").forEach(x => x.classList.toggle("active", x === t));
      paintFollowList(t.dataset.ftab);
    });

    // Help Center
    const helpBackdrop = document.getElementById("helpBackdrop");
    document.getElementById("helpClose").onclick = closeHelp;
    helpBackdrop.onclick = e => { if (e.target === helpBackdrop) closeHelp(); };

    // Notification bell + profile dropdown
    document.getElementById("bellBtn").onclick = e => { e.stopPropagation(); document.getElementById("profilePanel").hidden = true; toggleNotifPanel(); };
    document.getElementById("avatarBtn").onclick = e => { e.stopPropagation(); document.getElementById("notifPanel").hidden = true; toggleProfilePanel(); };
    document.addEventListener("click", e => {
      if (!e.target.closest(".bell-wrap")) document.getElementById("notifPanel").hidden = true;
      if (!e.target.closest(".avatar-wrap")) document.getElementById("profilePanel").hidden = true;
    });
    document.getElementById("ppProfile").onclick = () => { closeProfilePanel(); location.hash = "#/profile"; };
    document.getElementById("ppTheme").onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    document.getElementById("ppSettings").onclick = () => { closeProfilePanel(); openSettings(); };
    document.getElementById("ppHelp").onclick = () => { closeProfilePanel(); openHelp(); };
    document.getElementById("ppSignOut").onclick = signOut;

    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (!studioBackdrop.hidden) closeStudio();
      else if (!settingsBackdrop.hidden) closeSettings();
      else if (!followBackdrop.hidden) closeFollowModal();
      else if (!helpBackdrop.hidden) closeHelp();
      else { document.getElementById("notifPanel").hidden = true; document.getElementById("profilePanel").hidden = true; }
    });

    const scrim = document.getElementById("scrim");
    document.getElementById("menuBtn").onclick = () => { document.body.classList.add("nav-open"); scrim.hidden = false; };
    scrim.onclick = () => { document.body.classList.remove("nav-open"); scrim.hidden = true; };

    // access gate modal (content-barrier for guests)
    document.getElementById("gateDismiss").onclick = closeGate;
    document.getElementById("gateBackdrop").onclick = closeGate;
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !document.getElementById("accessGate").hidden) closeGate();
    });

    // fullscreen flashcard reader controls
    document.getElementById("readerClose").onclick = () => closeReader();
    document.getElementById("readerPrev").onclick  = () => readerStep(-1);
    document.getElementById("readerNext").onclick  = () => readerStep(1);
    document.addEventListener("keydown", e => {
      if (!readerOpen) return;
      if (e.key === "Escape")     { e.preventDefault(); closeReader(); }
      if (e.key === "ArrowRight") { e.preventDefault(); readerStep(1); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); readerStep(-1); }
    });

    // ---- Audio bar ----
    document.getElementById("audioPlay").onclick    = () => audio.pause();
    document.getElementById("audioSkipBack").onclick = () => audio.skip(-10);
    document.getElementById("audioSkipFwd").onclick  = () => audio.skip(10);
    document.getElementById("audioSpeed").onclick   = () => audio.cycleRate();
    document.getElementById("audioClose").onclick   = () => audio.stop();

    // ---- Share canvas modal ----
    const shareBackdrop = document.getElementById("shareBackdrop");
    document.getElementById("shareClose").onclick    = closeShareModal;
    document.getElementById("shareDownload").onclick = downloadShareImage;
    document.getElementById("shareCopy").onclick     = copyShareImageToClipboard;
    document.getElementById("shareNative").onclick   = nativeShare;
    shareBackdrop.onclick = e => { if (e.target === shareBackdrop) closeShareModal(); };
    document.querySelectorAll(".share-theme-pill").forEach(p => p.onclick = () => {
      document.querySelectorAll(".share-theme-pill").forEach(x => x.classList.toggle("active", x === p));
      _shareTheme = p.dataset.theme;
      if (_shareCard) paintSharePreviews(_shareCard, _shareTheme);
    });

    // ---- Stash popover ----
    document.getElementById("stashPopoverClose").onclick  = () => document.getElementById("stashPopover").hidden = true;
    document.getElementById("stashCreateTrigger").onclick = openStashCreateModal;

    // ---- Create stash modal ----
    const stashCreateBackdrop = document.getElementById("stashCreateBackdrop");
    document.getElementById("stashCreateClose").onclick  = closeStashCreateModal;
    document.getElementById("stashCreateCancel").onclick = closeStashCreateModal;
    stashCreateBackdrop.onclick = e => { if (e.target === stashCreateBackdrop) closeStashCreateModal(); };
    document.querySelectorAll("#emojiPickerRow .emoji-opt").forEach(b => b.onclick = () =>
      document.querySelectorAll(".emoji-opt").forEach(x => x.classList.toggle("active", x === b)));
    document.querySelectorAll("#gradientPalette .grad-swatch").forEach(b => b.onclick = () =>
      document.querySelectorAll(".grad-swatch").forEach(x => x.classList.toggle("active", x === b)));
    document.getElementById("stashCreateSave").onclick = async () => {
      const emoji = (document.querySelector(".emoji-opt.active") || {}).dataset?.emoji || "📚";
      const color = (document.querySelector(".grad-swatch.active") || {}).dataset?.color || "#7b2ff7";
      const title = (document.getElementById("stashTitleInput") || {}).value || "";
      const desc  = (document.getElementById("stashDescInput")  || {}).value || "";
      const s = await createCustomStash(title, desc, emoji, color);
      if (s) { closeStashCreateModal(); paintStashList(document.getElementById("stashPopover").dataset.cardId || ""); }
    };

    // ---- Comment / discussion drawer ----
    document.getElementById("discussionClose").onclick   = closeCommentDrawer;
    document.getElementById("discussionOverlay").onclick = closeCommentDrawer;
    const disInput = document.getElementById("discussionInput");
    document.getElementById("discussionSend").onclick = () => {
      const cid = document.getElementById("discussionDrawer").dataset.cardId;
      submitComment(cid, disInput.value, _replyTo);
    };
    disInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const cid = document.getElementById("discussionDrawer").dataset.cardId;
        submitComment(cid, disInput.value, _replyTo);
      }
    });

    // ---- Extend Escape handler for new modals ----
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (!document.getElementById("shareBackdrop").hidden) closeShareModal();
      else if (!document.getElementById("stashCreateBackdrop").hidden) closeStashCreateModal();
      else if (document.getElementById("discussionDrawer") &&
               !document.getElementById("discussionDrawer").hidden) closeCommentDrawer();
    });

    // ---- SW update toast ----
    document.addEventListener("sw:update-available", () =>
      toast("App updated - reload to get the latest version."));

    // Boot order matters:
    //   1. SRS.ready       - SM-2 state warm, so due-filtering is correct
    //   2. bootstrapData() - synapse.db (or its IndexedDB mirror) merged into
    //                        BOOKS / FLASHCARDS / stashes / comment counts
    //   3. router()        - first paint already sees server content
    // Every step swallows its own failures, so a dead backend delays the
    // first render by at most API_TIMEOUT_MS and then renders the seeds.
    const start = () => { updateDue(); refreshGuestChrome(); if (!location.hash) location.hash = "#/"; router(); };
    const ready = (window.SRS && SRS.ready && typeof SRS.ready.then === "function")
      ? SRS.ready : Promise.resolve();
    ready
      .then(() => bootstrapData())
      .catch(e => console.warn("[synapse] hydration failed:", e))
      .then(start);

    // Coming back online: refresh the mirror and repaint the current view.
    window.addEventListener("online", () => {
      bootstrapData().then(() => { updateDue(); router(); }).catch(() => {});
    });
  }

  /* ============================================================
     STEP 3 - PWA FEATURE CONTROLLERS
     1. Audio Narration  2. Share Canvas  3. Custom Stashes
     4. Comment Drawer   5. SW update wiring
     ============================================================ */

  /* ----------------------------------------------------------
     1. AUDIO NARRATION CONTROLLER (Web Speech API)
     Seek is simulated: cancel + re-queue from an estimated
     word offset (approx 2.5 words/sec × rate).
     ---------------------------------------------------------- */
  const audio = (() => {
    let script = "", wordList = [], wordIdx = 0;
    let rate = 1, rateIdx = 0;
    let playing = false, tickTimer = null;
    const RATES = [1, 1.25, 1.5, 2];
    const RATE_LABELS = ["1×", "1.25×", "1.5×", "2×"];

    const $ = id => document.getElementById(id);
    const wps = () => 2.5 * rate;
    const totalDur = () => wordList.length / wps();
    const fmtSecs = s => { s = Math.round(Math.max(0, s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

    function startTick() {
      stopTick();
      const startWord = wordIdx, t0 = Date.now();
      tickTimer = setInterval(() => {
        const elapsed = (Date.now() - t0) / 1000;
        wordIdx = Math.min(wordList.length, startWord + Math.round(elapsed * wps()));
        const pct = wordList.length ? wordIdx / wordList.length : 0;
        const rem = totalDur() - wordIdx / wps();
        const pf = $("audioProgressFill"), te = $("audioTime");
        if (pf) pf.style.width = (pct * 100).toFixed(1) + "%";
        if (te) te.textContent = fmtSecs(rem);
      }, 250);
    }

    function stopTick() { clearInterval(tickTimer); tickTimer = null; }

    function buildScript(card) {
      if (typeof getTtsScript === "function") {
        const ts = getTtsScript(card);
        return [ts.intro, ts.body, ts.outro].filter(Boolean).join(" ");
      }
      return [card.title, card.source, card.body, card.zeigarnikCliffhanger].filter(Boolean).join(". ");
    }

    function speakFrom(idx) {
      window.speechSynthesis.cancel();
      wordIdx = Math.max(0, Math.min(idx, wordList.length - 1));
      const u = new SpeechSynthesisUtterance(wordList.slice(wordIdx).join(" "));
      u.rate = rate;
      u.onstart = () => {
        playing = true;
        const bar = $("audioBar");
        if (bar) bar.classList.remove("paused");
        const pb = $("audioPlay"); if (pb) pb.textContent = "⏸";
        startTick();
      };
      u.onend = () => {
        playing = false;
        stopTick();
        const bar = $("audioBar"), pf = $("audioProgressFill"), te = $("audioTime"), pb = $("audioPlay");
        if (bar) bar.classList.add("paused");
        if (pf) pf.style.width = "100%";
        if (te) te.textContent = "0:00";
        if (pb) pb.textContent = "▶";
        if (typeof readerStep === "function" && readerOpen) setTimeout(() => readerStep(1), 700);
      };
      u.onerror = () => { playing = false; stopTick(); };
      window.speechSynthesis.speak(u);
    }

    function play(card) {
      if (!window.speechSynthesis) { toast("Text-to-speech is not supported in this browser."); return; }
      script = buildScript(card);
      wordList = script.split(/\s+/).filter(Boolean);
      wordIdx = 0; rateIdx = 0; rate = 1;
      const bar = $("audioBar");
      if (bar) bar.hidden = false;
      const titleEl = $("audioTitle"), srcEl = $("audioSource"), sb = $("audioSpeed");
      if (titleEl) titleEl.textContent = card.title || "Narration";
      if (srcEl) srcEl.textContent = [card.source, card.author].filter(Boolean).join(" · ");
      if (sb) sb.textContent = "1×";
      speakFrom(0);
    }

    function pause() {
      if (!window.speechSynthesis) return;
      const bar = $("audioBar"), pb = $("audioPlay");
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        if (bar) bar.classList.remove("paused");
        if (pb) pb.textContent = "⏸";
        startTick();
      } else {
        window.speechSynthesis.pause();
        if (bar) bar.classList.add("paused");
        if (pb) pb.textContent = "▶";
        stopTick();
      }
    }

    function stop() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      playing = false; stopTick();
      const bar = $("audioBar"), pf = $("audioProgressFill"), te = $("audioTime");
      if (bar) { bar.hidden = true; bar.classList.remove("paused"); }
      if (pf) pf.style.width = "0%";
      if (te) te.textContent = "0:00";
    }

    function skip(seconds) {
      if (!wordList.length) return;
      speakFrom(Math.max(0, Math.min(wordList.length - 1, wordIdx + Math.round(seconds * wps()))));
    }

    function cycleRate() {
      rateIdx = (rateIdx + 1) % RATES.length;
      rate = RATES[rateIdx];
      const sb = $("audioSpeed"); if (sb) sb.textContent = RATE_LABELS[rateIdx];
      if (playing) speakFrom(wordIdx);
    }

    return { play, pause, stop, skip, cycleRate };
  })();

  function playCardAudio(card) { audio.play(card); }

  /* ----------------------------------------------------------
     2. HTML5 CANVAS SHARE CARD GENERATOR
     Off-screen canvas at 1080×1080 (1:1) or 1080×1920 (9:16).
     ---------------------------------------------------------- */
  const SHARE_THEMES = {
    midnight:  { bg1: "#0f0c1a", bg2: "#1e1540", text: "#ffffff", sub: "#a89bcc", brand: "#7b2ff7" },
    parchment: { bg1: "#fdf8ef", bg2: "#f5ede0", text: "#2d2118", sub: "#8c7b6a", brand: "#c4602a" },
    aurora:    { bg1: "#0d1f2d", bg2: "#1a3a4a", text: "#e8f8f5", sub: "#a0d9cc", brand: "#00b894" },
    carbon:    { bg1: "#141414", bg2: "#222222", text: "#f0f0f0", sub: "#888888", brand: "#555555" },
  };
  let _shareCard = null, _shareTheme = "midnight";

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _wrapText(ctx, text, maxW) {
    const lines = [], words = (text || "").split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW) { if (cur) lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function _clipText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
    return text + "…";
  }

  function drawShareCanvas(card, theme, format) {
    const th = SHARE_THEMES[theme] || SHARE_THEMES.midnight;
    const is916 = format === "9:16";
    const W = 1080, H = is916 ? 1920 : 1080;
    const cvs = document.createElement("canvas");
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext("2d");

    // Background
    const grd = ctx.createLinearGradient(0, 0, W * 0.6, H);
    grd.addColorStop(0, th.bg1); grd.addColorStop(1, th.bg2);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Accent blob
    ctx.save(); ctx.globalAlpha = 0.18;
    const blob = ctx.createRadialGradient(W * 0.82, H * 0.12, 0, W * 0.82, H * 0.12, W * 0.6);
    blob.addColorStop(0, th.brand); blob.addColorStop(1, "transparent");
    ctx.fillStyle = blob; ctx.fillRect(0, 0, W, H); ctx.restore();

    const pad = is916 ? 100 : 80, cW = W - pad * 2;

    // Icon tile
    const icoY = is916 ? 280 : 190, icoSz = is916 ? 200 : 160;
    ctx.save(); ctx.globalAlpha = 0.9;
    const ig = ctx.createLinearGradient(W / 2 - icoSz / 2, icoY, W / 2 + icoSz / 2, icoY + icoSz);
    ig.addColorStop(0, th.brand); ig.addColorStop(1, th.bg2);
    _roundRect(ctx, W / 2 - icoSz / 2, icoY, icoSz, icoSz, 28);
    ctx.fillStyle = ig; ctx.fill(); ctx.restore();
    ctx.save();
    ctx.font = `bold ${is916 ? 90 : 72}px Arial`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.95;
    ctx.fillText(card.kind === "diagram" ? "📊" : card.kind === "sandbox" ? "🧪" : "💡", W / 2, icoY + icoSz / 2);
    ctx.restore();

    // Source line
    const metaY = icoY + icoSz + (is916 ? 60 : 44);
    ctx.save();
    ctx.font = `600 ${is916 ? 38 : 30}px Inter, Arial`;
    ctx.fillStyle = th.sub; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(_clipText(ctx, [card.source, card.author].filter(Boolean).join(" · "), cW), W / 2, metaY);
    ctx.restore();

    // Title
    const tsz = is916 ? 68 : 54, titleY = metaY + (is916 ? 70 : 54);
    ctx.save();
    ctx.font = `900 ${tsz}px Inter, Arial`;
    ctx.fillStyle = th.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const tLines = _wrapText(ctx, card.title || "", cW);
    tLines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, titleY + i * tsz * 1.25));
    ctx.restore();

    // Body excerpt
    const bsz = is916 ? 44 : 36;
    const bodyY = titleY + Math.min(tLines.length, 3) * tsz * 1.25 + (is916 ? 60 : 44);
    const bodyText = card.body || card.prompt || card.caption || "";
    ctx.save();
    ctx.font = `400 ${bsz}px Inter, Arial`;
    ctx.fillStyle = th.sub; ctx.textAlign = "center"; ctx.textBaseline = "top";
    _wrapText(ctx, bodyText, cW).slice(0, 4).forEach((ln, i) => ctx.fillText(ln, W / 2, bodyY + i * bsz * 1.5));
    ctx.restore();

    // Watermark
    ctx.save();
    ctx.font = `700 ${is916 ? 36 : 28}px Inter, Arial`;
    ctx.fillStyle = th.sub; ctx.globalAlpha = 0.65;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("◈ Synapse", W / 2, H - (is916 ? 90 : 72));
    ctx.restore();
    return cvs;
  }

  function paintSharePreviews(card, theme) {
    _shareCard = card; _shareTheme = theme || _shareTheme;
    [["shareCanvas11","1:1"],["shareCanvas916","9:16"]].forEach(([id, fmt]) => {
      const wrap = document.getElementById(id); if (!wrap) return;
      wrap.innerHTML = "";
      const cvs = drawShareCanvas(card, _shareTheme, fmt);
      cvs.style.cssText = "width:100%;height:100%;object-fit:cover";
      wrap.appendChild(cvs);
    });
  }

  function openShareModal(card) {
    _shareCard = card;
    const bd = document.getElementById("shareBackdrop"); if (!bd) return;
    bd.hidden = false;
    paintSharePreviews(card, _shareTheme);
  }

  function closeShareModal() { const bd = document.getElementById("shareBackdrop"); if (bd) bd.hidden = true; }

  function downloadShareImage() {
    if (!_shareCard) return;
    const a = document.createElement("a");
    a.download = "synapse-idea.png";
    a.href = drawShareCanvas(_shareCard, _shareTheme, "1:1").toDataURL("image/png");
    a.click();
    toast("Image downloaded!");
  }

  async function copyShareImageToClipboard() {
    if (!_shareCard) return;
    if (!navigator.clipboard || !window.ClipboardItem) { toast("Clipboard API not supported."); return; }
    try {
      const blob = await new Promise(res => drawShareCanvas(_shareCard, _shareTheme, "1:1").toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Image copied to clipboard!");
    } catch { toast("Could not copy image."); }
  }

  async function nativeShare() {
    if (!_shareCard) return;
    const blob = await new Promise(res => drawShareCanvas(_shareCard, _shareTheme, "1:1").toBlob(res, "image/png"));
    const file = new File([blob], "synapse-idea.png", { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: _shareCard.title, text: "Found this idea on Synapse", files: [file] }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: _shareCard.title, url: location.href }); return; } catch {}
    }
    downloadShareImage();
  }

  /* ----------------------------------------------------------
     3. CUSTOM STASHES - persistence: "ds_custom_stashes"
     Schema: { id, title, desc, emoji, color, cardIds:[], created }
     Both SEED_STASHES and user-created stashes are supported.
     ---------------------------------------------------------- */
  let customStashes = load(LS.customStashes, []);
  function saveStashes() { save(LS.customStashes, customStashes); }

  // POST /api/stashes when the backend is reachable and we hold a token;
  // otherwise the stash is created locally and lives in localStorage exactly
  // as it did before. Async - callers must await it.
  async function createCustomStash(title, desc, emoji, color) {
    if (!title.trim()) { toast("Stash title can't be empty."); return null; }

    const payload = {
      title: title.trim(), description: (desc || "").trim(),
      emoji: emoji || "📚", color: color || "#7b2ff7",
    };

    if (getApiToken()) {
      try {
        const created = await apiFetch("/stashes", { method: "POST", body: payload });
        const s = mapApiStash(created);
        remoteStashes.unshift(s);
        Cache.cacheStashes([created]);
        toast(`Stash "${s.title}" created!`);
        return s;
      } catch (e) {
        // 401/403 or an unreachable server: fall through to the local path
        // rather than losing what the user just typed.
        console.warn("[synapse] stash create fell back to local:", e.message);
      }
    }

    const s = {
      id: "cs-" + Date.now(),
      title: payload.title, desc: payload.description,
      emoji: payload.emoji, color: payload.color,
      cardIds: [], created: Date.now(), owned: true,
    };
    customStashes.unshift(s);
    saveStashes();
    toast(`Stash "${s.title}" created!`);
    return s;
  }

  // POST /api/stashes/{id}/toggle-card. The server may FORK a curated default
  // into a private copy on first write and answer with a different stashId -
  // rebind to it so the next toggle hits the copy, not the default. Async.
  async function toggleCardInStash(cardId, stashId) {
    const remote = remoteStashes.find(x => x.id === stashId);

    if (remote && getApiToken()) {
      try {
        const res = await apiFetch(`/stashes/${encodeURIComponent(stashId)}/toggle-card`, {
          method: "POST", body: { cardId },
        });
        if (res.stashId !== stashId) {
          // The server forked a curated default: the whole list changed
          // shape (the default is now hidden behind the private copy), so
          // take the authoritative version before anything repaints.
          await hydrateStashes();
          return res.added;
        }
        const target = remoteStashes.find(x => x.id === res.stashId);
        if (target) {
          target.cardIds = res.added
            ? (target.cardIds.includes(cardId) ? target.cardIds : target.cardIds.concat(cardId))
            : target.cardIds.filter(id => id !== cardId);
        }
        return res.added;
      } catch (e) {
        console.warn("[synapse] stash toggle fell back to local:", e.message);
      }
    }

    // Offline / signed out: copy-on-write into the local store, same as before.
    let s = customStashes.find(x => x.id === stashId);
    if (!s) {
      const src = remote || (typeof SEED_STASHES !== "undefined" && SEED_STASHES.find(x => x.id === stashId));
      if (src) {
        s = { id: src.id, title: src.title, desc: src.desc || src.description || "",
              emoji: src.emoji || src.ico || "📚", color: src.color || "#7b2ff7",
              cardIds: [...(src.cardIds || [])], created: src.created || Date.now(), owned: true };
        customStashes.push(s);
      }
    }
    if (!s) return false;
    const has = (s.cardIds || []).includes(cardId);
    s.cardIds = has ? s.cardIds.filter(id => id !== cardId) : [...(s.cardIds || []), cardId];
    saveStashes();
    if (remote) remote.cardIds = s.cardIds.slice();
    return !has;
  }

  function openStashPopover(cardId, anchorEl) {
    const pop = document.getElementById("stashPopover"); if (!pop) return;
    pop.dataset.cardId = cardId;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      pop.style.top = (r.bottom + 8 + window.scrollY) + "px";
      pop.style.left = Math.min(r.left, window.innerWidth - 296) + "px";
    }
    paintStashList(cardId);
    pop.hidden = false;
    setTimeout(() => {
      const dismiss = e => { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener("click", dismiss); } };
      document.addEventListener("click", dismiss);
    }, 0);
  }

  function paintStashList(cardId) {
    const list = document.getElementById("stashList"); if (!list) return;
    const allS = allStashes();
    if (!allS.length) { list.innerHTML = `<div class="drafts-empty">No stashes yet.</div>`; return; }
    list.innerHTML = allS.map(s => {
      const checked = (s.cardIds || []).includes(cardId);
      return `<div class="stash-item${checked ? " checked" : ""}" data-sid="${esc(s.id)}">
        <span class="stash-ico">${esc(s.emoji || "📚")}</span>
        <span class="stash-item-name">${esc(s.title)}</span>
        <span class="stash-check">${checked ? "✓" : ""}</span>
      </div>`;
    }).join("");
    list.querySelectorAll(".stash-item").forEach(item => {
      item.onclick = async () => {
        const cid = document.getElementById("stashPopover").dataset.cardId;
        const sid = item.dataset.sid;
        item.classList.add("busy");
        const added = await toggleCardInStash(cid, sid);
        item.classList.remove("busy");
        item.classList.toggle("checked", added);
        item.querySelector(".stash-check").textContent = added ? "✓" : "";
        toast(added ? "Saved to stash!" : "Removed from stash.");
        // Writing to a curated default forks it server-side, so the list of
        // stashes itself can change - repaint rather than trusting the row.
        const still = allStashes().find(s => s.id === sid);
        if (!still || (still.cardIds || []).includes(cid) !== added) paintStashList(cid);
      };
    });
  }

  function openStashCreateModal() {
    document.getElementById("stashPopover").hidden = true;
    document.getElementById("stashCreateBackdrop").hidden = false;
    document.querySelectorAll(".emoji-opt").forEach((b, i) => b.classList.toggle("active", i === 0));
    document.querySelectorAll(".grad-swatch").forEach((b, i) => b.classList.toggle("active", i === 0));
    const ti = document.getElementById("stashTitleInput"), di = document.getElementById("stashDescInput");
    if (ti) ti.value = ""; if (di) di.value = "";
    if (ti) ti.focus();
  }

  function closeStashCreateModal() { document.getElementById("stashCreateBackdrop").hidden = true; }

  function renderStashView(stashId) {
    const s = stashById(stashId);
    if (!s) { view.innerHTML = `<p style="padding:32px 20px;color:var(--text-faint)">Stash not found.</p>`; return; }

    const cards = (s.cardIds || []).map(id => cardById(id)).filter(Boolean);
    view.innerHTML = `
      <div style="padding:24px 20px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px">
          <div style="width:52px;height:52px;border-radius:14px;background:${esc(s.color || "#7b2ff7")};display:grid;place-items:center;font-size:26px;flex-shrink:0">${esc(s.emoji || "📚")}</div>
          <div>
            <h1 style="margin:0;font-size:22px;font-weight:900;line-height:1.2">${esc(s.title)}</h1>
            ${s.desc ? `<p style="margin:4px 0 0;color:var(--text-soft);font-size:13.5px">${esc(s.desc)}</p>` : ""}
            <div style="font-size:12px;color:var(--text-faint);font-weight:600;margin-top:4px">${cards.length} idea${cards.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        ${cards.length === 0
          ? `<div style="text-align:center;padding:48px 0;color:var(--text-faint)">
               <div style="font-size:40px;margin-bottom:12px">📭</div>
               <div style="font-weight:700">No ideas in this stash yet.</div>
               <div style="font-size:13px;margin-top:6px">Tap the bookmark icon on any idea card to save it here.</div>
             </div>`
          : `<div id="stashFeed"></div>`}
      </div>`;

    if (cards.length) {
      const feed = document.getElementById("stashFeed");
      const stubBook = { id: "stash", title: s.title, author: "" };
      cards.forEach((c, i) => {
        const node = ideaCard(c, stubBook, i, false);
        // Override the reader open to use a stash-scoped reader session
        const vm = node.querySelector(".view-more");
        if (vm) vm.onclick = () => openStashReader(cards, i);
        const vis = node.querySelector(".idea-visual");
        if (vis) vis.onclick = () => openStashReader(cards, i);
        feed.appendChild(node);
      });
    }
  }

  function openStashReader(cards, startIdx) {
    readerBook = { id: "stash", title: "Stash", author: "" };
    readerCards = cards;
    readerIdx = startIdx || 0;
    readerOpen = true;
    document.getElementById("reader").hidden = false;
    document.body.classList.add("reader-open");
    haptic([15, 30]);
    paintReader();
  }

  /* ----------------------------------------------------------
     4. COMMENT DRAWER CONTROLLER
     Seed data: commentsForCard() from data.js (read-only).
     User-added comments persist to "ds_card_comments".
     ---------------------------------------------------------- */
  let commentStore = load(LS.cardComments, {});
  function saveComments() { save(LS.cardComments, commentStore); }

  // Synchronous read - footerHTML() needs a count during paint. Server data
  // (commentCache, warmed from IndexedDB at boot and refreshed by the drawer)
  // wins; otherwise fall back to the data.js seeds plus anything written
  // offline into localStorage.
  function _allCommentsForCard(cardId) {
    if (commentCache.has(cardId)) return commentCache.get(cardId);
    const local = (commentStore[cardId] || []).map(c => mapApiComment(c, cardId));
    return [..._seedCommentsFor(cardId), ...local];
  }

  function openCommentDrawer(cardId) {
    const drawer = document.getElementById("discussionDrawer");
    const overlay = document.getElementById("discussionOverlay");
    if (!drawer) return;
    const card = cardById(cardId);
    drawer.dataset.cardId = cardId;
    const titleEl = document.getElementById("discussionTitle");
    if (titleEl) titleEl.textContent = (card && card.title) ? card.title : "Discussion";
    const meAv = document.getElementById("discussionMeAvatar");
    if (meAv) paintAvatar(meAv);

    // Paint whatever we already hold so the drawer opens instantly, then
    // reconcile with the server in the background.
    renderCommentThreads(cardId);
    drawer.hidden = false;
    if (overlay) overlay.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));

    fetchCommentThreads(cardId).then(changed => {
      // Only repaint if this card's drawer is still the one on screen.
      if (changed && drawer.dataset.cardId === cardId) renderCommentThreads(cardId);
    });
  }

  // GET /api/cards/{card_id}/comments -> memory + IndexedDB. Resolves false
  // (rather than throwing) when the backend is unreachable, leaving whatever
  // the cache had on screen.
  async function fetchCommentThreads(cardId) {
    try {
      const data = await apiFetch(`/cards/${encodeURIComponent(cardId)}/comments`);
      const flat = flattenThreads(data && data.comments, cardId);
      commentCache.set(cardId, flat);
      Cache.cacheComments(cardId, (data && data.comments) || []);
      return true;
    } catch {
      if (!commentCache.has(cardId)) {
        // No live data and nothing warmed: try this card's slice of the cache.
        try {
          const rows = await Cache.getCachedComments(cardId);
          if (rows.length) {
            commentCache.set(cardId, rows.map(r => mapApiComment(r, cardId)));
            return true;
          }
        } catch {}
      }
      return false;
    }
  }

  function closeCommentDrawer() {
    const drawer = document.getElementById("discussionDrawer");
    const overlay = document.getElementById("discussionOverlay");
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.addEventListener("transitionend", () => {
      drawer.hidden = true;
      if (overlay) overlay.hidden = true;
    }, { once: true });
  }

  function renderCommentThreads(cardId) {
    const body = document.getElementById("discussionBody"); if (!body) return;
    const topLevel = _allCommentsForCard(cardId).filter(c => !c.parentId);
    if (!topLevel.length) {
      body.innerHTML = `<div class="drafts-empty" style="text-align:center;padding:40px 0">No comments yet - be the first! 💬</div>`;
      return;
    }
    const allC = _allCommentsForCard(cardId);
    body.innerHTML = topLevel.map(c => _commentThreadHTML(c, allC)).join("");
    body.querySelectorAll(".comment-like-btn").forEach(btn =>
      btn.onclick = () => _toggleCommentLike(cardId, btn.dataset.cid, btn));
    body.querySelectorAll(".comment-reply-btn").forEach(btn =>
      btn.onclick = () => _focusReply(btn.dataset.cid));
  }

  function _commentRowHTML(c) {
    const liked = load("ds_clk_" + c.id, false);
    const count = (c.likes || 0) + (liked ? 1 : 0);
    return `<div class="comment-row" id="cm-${esc(c.id)}">
      <div class="comment-avatar" style="background:${esc(c.color || "#7b2ff7")}">${esc(c.avatar || "?")}</div>
      <div class="comment-bubble">
        <div class="comment-author">${esc(c.author || "Anonymous")}</div>
        <div class="comment-text">${esc(c.text || "")}</div>
        <div class="comment-meta">
          <span class="comment-ts">${timeAgo(c.ts || Date.now())}</span>
          <button class="comment-like-btn${liked ? " liked" : ""}" data-cid="${esc(c.id)}">♥ <span class="clk-n">${count}</span></button>
          <button class="comment-reply-btn" data-cid="${esc(c.id)}">Reply</button>
        </div>
      </div>
    </div>`;
  }

  function _commentThreadHTML(c, all) {
    const replies = all.filter(r => r.parentId === c.id);
    return `<div class="comment-thread">
      ${_commentRowHTML(c)}
      ${replies.length ? `<div class="comment-replies">${replies.map(_commentRowHTML).join("")}</div>` : ""}
    </div>`;
  }

  let _replyTo = null;
  function _focusReply(parentId) {
    _replyTo = parentId;
    const inp = document.getElementById("discussionInput");
    if (inp) { inp.placeholder = "Replying…"; inp.focus(); }
  }

  // POST /api/cards/{card_id}/comments, with a localStorage fallback so a
  // comment typed offline is not simply lost. Async - callers may ignore it.
  async function submitComment(cardId, text, parentId) {
    if (!text || !text.trim()) return;
    if (isGuest()) { openGate("preview"); return; }

    const inp = document.getElementById("discussionInput");
    const clearInput = () => {
      _replyTo = null;
      if (inp) { inp.value = ""; inp.placeholder = "Add a comment…"; inp.disabled = false; }
    };
    if (inp) inp.disabled = true;

    const displayName = [user.profile.firstName, user.profile.lastName].filter(Boolean).join(" ") || "You";

    try {
      const created = await apiFetch(`/cards/${encodeURIComponent(cardId)}/comments`, {
        method: "POST",
        body: {
          text: text.trim(),
          parentId: parentId || null,
          // Used only when the request is unauthenticated; a signed-in
          // comment is always attributed from the server's user record.
          author: displayName, avatar: initials(), color: "#7b2ff7",
        },
      });
      const rec = mapApiComment(created, cardId);
      commentCache.set(cardId, _allCommentsForCard(cardId).concat(rec));
      Cache.cacheComments(cardId, [created]);
      clearInput();
      renderCommentThreads(cardId);
      return rec;
    } catch (e) {
      console.warn("[synapse] comment post fell back to local:", e.message);
      const c = {
        id: "uc-" + Date.now(),
        author: displayName, avatar: initials(), color: "#7b2ff7",
        text: text.trim(), likes: 0, ts: Date.now(),
        parentId: parentId || null,
      };
      commentStore[cardId] = commentStore[cardId] || [];
      commentStore[cardId].push(c);
      saveComments();
      // Keep the in-memory view consistent with what was just written.
      if (commentCache.has(cardId)) commentCache.set(cardId, commentCache.get(cardId).concat(mapApiComment(c, cardId)));
      clearInput();
      renderCommentThreads(cardId);
      return c;
    }
  }

  // Per-viewer like state stays local (there is no likes join table); the
  // server owns the aggregate count and is told which way the toggle went.
  // Paints optimistically, then corrects from the response.
  async function _toggleCommentLike(cardId, commentId, btn) {
    const key = "ds_clk_" + commentId;
    const liked = !load(key, false);
    save(key, liked);
    btn.classList.toggle("liked", liked);

    const span = btn.querySelector(".clk-n");
    const rec = _allCommentsForCard(cardId).find(x => x.id === commentId);
    // rec.likes is the server-side total (ours included once we've liked it),
    // so the optimistic step is ±1, not "+1 when liked".
    const base = rec ? rec.likes || 0 : 0;
    if (span) span.textContent = Math.max(0, base + (liked ? 1 : -1));

    try {
      const res = await apiFetch(`/comments/${encodeURIComponent(commentId)}/like`, {
        method: "POST", body: { liked },
      });
      if (rec) rec.likes = res.likes;
      if (span) span.textContent = res.likes;
    } catch {
      // Offline: the local toggle stands and re-syncs on the next fetch.
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
