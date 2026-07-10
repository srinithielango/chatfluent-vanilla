/* =========================================================================
   ChatFluent — single-file SPA build
   All 8 former pages (index/dashboard/category/play/level-complete/
   level-failed/challenge/play-challenge) now live here as "views",
   switched by a tiny hash router (#/dashboard, #/category?id=x, ...).
   ========================================================================= */

/* ---------------------------------------------------------------------
   1. CONFIG + SUPABASE CLIENT
   (was js/config.js + js/client.js)
--------------------------------------------------------------------- */
const SUPABASE_URL = "https://hicejdenjuustohbxqua.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpY2VqZGVuanV1c3RvaGJ4cXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0OTgyNjAsImV4cCI6MjA5OTA3NDI2MH0.QqMfzzpIUM6cmRmG-Uh4FSSMAek3V7ICFA8Cw4OmhJE";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------------------
   2. SOUNDS (was js/sounds.js)
--------------------------------------------------------------------- */
const sounds = {
  correct: new Audio("sounds/correct.wav"),
  wrong: new Audio("sounds/wrong.wav"),
  complete: new Audio("sounds/complete.wav"),
};

function playSound(name) {
  const sfx = sounds[name];
  if (!sfx) return;
  sfx.currentTime = 0;
  sfx.play().catch(() => {
    // Browsers block autoplay before the first user interaction — harmless.
  });
}

/* ---------------------------------------------------------------------
   3. HEARTS (was js/hearts.js)
--------------------------------------------------------------------- */
const MAX_HEARTS = 3;
const HEART_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function getHeartsState(hearts, lastHeartLostAt, now) {
  now = now || new Date();
  if (hearts > 0 || !lastHeartLostAt) {
    return { hearts: hearts, needsRefillCommit: false, msRemaining: 0 };
  }
  const elapsed = now.getTime() - new Date(lastHeartLostAt).getTime();
  const msRemaining = HEART_COOLDOWN_MS - elapsed;
  if (msRemaining <= 0) {
    return { hearts: MAX_HEARTS, needsRefillCommit: true, msRemaining: 0 };
  }
  return { hearts: 0, needsRefillCommit: false, msRemaining: msRemaining };
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/* ---------------------------------------------------------------------
   4. STREAK (was js/streak.js)
--------------------------------------------------------------------- */
function toDateOnly(dateLike) {
  const d = new Date(dateLike);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(a, b) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((toDateOnly(b) - toDateOnly(a)) / MS_PER_DAY);
}

function computeNextStreak(lastLoginDate, currentStreak, today) {
  today = today || new Date();
  if (!lastLoginDate) return { streak: 1, shouldUpdate: true };
  const diff = daysBetween(lastLoginDate, today);
  if (diff === 0) return { streak: currentStreak, shouldUpdate: false };
  if (diff === 1) return { streak: currentStreak + 1, shouldUpdate: true };
  return { streak: 1, shouldUpdate: true };
}

function formatDateOnly(date) {
  return toDateOnly(date || new Date()).toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------
   5. AUTH / PROFILE (was js/profile.js)
   Note: redirects that used to be window.location.href = "index.html"
   etc. now go through navigate() into the router below.
--------------------------------------------------------------------- */
async function loadProfile(user) {
  let { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) {
    const { data: created } = await db
      .from("profiles")
      .insert({
        id: user.id,
        full_name: user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name),
        email: user.email,
        avatar_url: user.user_metadata && user.user_metadata.avatar_url,
      })
      .select("*")
      .single();
    profile = created;
  }

  const updates = {};

  const streakResult = computeNextStreak(profile.last_login_date, profile.streak);
  if (streakResult.shouldUpdate) {
    updates.streak = streakResult.streak;
    updates.last_login_date = formatDateOnly();
  }

  const heartsResult = getHeartsState(profile.hearts, profile.last_heart_lost_at);
  if (heartsResult.needsRefillCommit) {
    updates.hearts = heartsResult.hearts;
    updates.last_heart_lost_at = null;
  }

  if (Object.keys(updates).length > 0) {
    const { data: updated } = await db
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("*")
      .single();
    profile = updated || Object.assign({}, profile, updates);
  }

  return profile;
}

async function requireAuthAndProfile() {
  const {
    data: { session },
  } = await db.auth.getSession();

  if (!session) {
    navigate("landing");
    return null;
  }

  const profile = await loadProfile(session.user);
  return { user: session.user, profile: profile };
}

async function signOut() {
  await db.auth.signOut();
  navigate("landing");
}

/* ---------------------------------------------------------------------
   6. SHARED HELPERS
--------------------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const appRoot = document.getElementById("app-root");

/* ---------------------------------------------------------------------
   7. ROUTER
   Replaces multi-page navigation. Views live at #/name?query=params
   e.g. #/category?id=shopping, #/play?levelId=abc123
--------------------------------------------------------------------- */
function parseHash() {
  const raw = window.location.hash.slice(1) || "/landing";
  const [path, queryString] = raw.split("?");
  const view = path.replace(/^\//, "") || "landing";
  const params = new URLSearchParams(queryString || "");
  return { view, params };
}

// Use instead of window.location.href = "somepage.html?x=y"
function navigate(view, paramsObj) {
  const qs = paramsObj ? new URLSearchParams(paramsObj).toString() : "";
  window.location.hash = "/" + view + (qs ? "?" + qs : "");
}

const routes = {
  landing: renderLanding,
  dashboard: renderDashboard,
  "conversation-categories": renderConversationCategories,
  category: renderCategory,
  play: renderPlay,
  "level-complete": renderLevelComplete,
  "level-failed": renderLevelFailed,
  challenge: renderChallenge,
  "play-challenge": renderPlayChallenge,
  "fill-blank": renderFillBlankLevels,
  "play-fill-blank": renderPlayFillBlank,
  "sentence-correction": renderCorrectionLevels,
  "play-sentence-correction": renderPlayCorrection,
  "speech-practice": renderSpeechLevels,
  "play-speech": renderPlaySpeech,
};

function route() {
  const { view, params } = parseHash();
  const fn = routes[view] || renderLanding;
  fn(params);
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);

/* =========================================================================
   VIEWS
   ========================================================================= */

/* ---------------------------------------------------------------------
   VIEW: landing  (was index.html + no js file, inline script)
--------------------------------------------------------------------- */
async function renderLanding() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (session) {
    navigate("dashboard");
    return;
  }

  appRoot.className = "container";
  appRoot.innerHTML = `
    <div class="topbar">
      <div class="user-block">
        <span class="avatar-fallback" style="background: var(--plum-500); color: white;">c</span>
        <span class="font-display" style="font-weight:600; font-size:1.1rem;">ChatFluent</span>
      </div>
      <span class="badge">Free to practice</span>
    </div>

    <section class="hero">
      <div>
        <p class="eyebrow">Real replies, not grammar drills</p>
        <h1>Learn what to say next.</h1>
        <p class="sub">
          ChatFluent drops you into real conversations — shopping, greetings, travel —
          and asks you to pick the reply a fluent speaker would send. Get it right,
          keep the streak alive.
        </p>
        <div class="hero-actions">
          <button id="google-signin-btn" class="btn btn-dark">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.2-17 10.4z"/>
              <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.1 27 36 24 36c-5.3 0-9.6-3.4-11.3-8l-6.6 5.1C9.9 39.6 16.4 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C39.9 37 44 31 44 24c0-1.2-.1-2.4-.4-3.5z"/>
            </svg>
            <span id="signin-label">Continue with Google</span>
          </button>
          <p style="font-size:14px; color: rgba(28,37,33,0.5);">No card. No essays. Just conversations.</p>
        </div>

        <div class="stats">
          <div><div class="num">4</div><div class="label">conversation topics</div></div>
          <div><div class="num">3</div><div class="label">hearts per level</div></div>
          <div><div class="num">+10</div><div class="label">XP per correct reply</div></div>
        </div>
      </div>

      <div class="phone-mock">
        <div class="dots">
          <span style="background: var(--coral-500);"></span>
          <span style="background: var(--sun-400);"></span>
          <span style="background: var(--mint-400);"></span>
          <span class="font-mono" style="margin-left:8px; font-size:12px; color: rgba(28,37,33,0.4);">Shopping · Level 2</span>
        </div>
        <div class="bubble-row"><div class="bubble theirs">Can I try this on?</div></div>
        <div class="bubble-row mine"><div class="bubble mine">Sure, the fitting rooms are right over there.</div></div>
        <div class="bubble-row"><div class="bubble theirs">Great, thanks!</div></div>
        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:8px;">
          <div class="option-btn correct" style="cursor:default;">Sure, the fitting rooms are right over there.</div>
          <div class="option-btn dim" style="cursor:default;">No, we don't sell that here.</div>
          <div class="option-btn dim" style="cursor:default;">I like pizza a lot.</div>
        </div>
      </div>
    </section>
  `;

  document.getElementById("google-signin-btn").addEventListener("click", async () => {
    const btn = document.getElementById("google-signin-btn");
    const label = document.getElementById("signin-label");
    btn.disabled = true;
    label.textContent = "Signing in…";

    // Single-page app now, so we always come back to the same URL;
    // renderLanding() above detects the session and forwards to #/dashboard.
    await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  });
}

/* ---------------------------------------------------------------------
   VIEW: dashboard  (was js/dashboard.js)
--------------------------------------------------------------------- */
const CATEGORY_ACCENTS = {
  greetings: { bg: "var(--mint-50)", fg: "var(--mint-600)" },
  shopping: { bg: "var(--plum-50)", fg: "var(--plum-600)" },
  travel: { bg: "#FFF3E4", fg: "#F5A623" },
  "daily-conversation": { bg: "#FDE9E5", fg: "var(--coral-600)" },
};

async function renderDashboard() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading your dashboard…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { profile } = result;

  const displayName = (profile.full_name || "there").split(" ")[0];
  const avatarHtml = profile.avatar_url
    ? `<img class="avatar" src="${profile.avatar_url}" alt="" />`
    : `<span class="avatar-fallback">${displayName[0].toUpperCase()}</span>`;

  // Dashboard now only shows two top-level modes. "Conversation Build
  // Challenge" opens a sub-page listing the 4 topic categories
  // (Greetings/Shopping/Travel/Daily Conversation); "Tamil -> English
  // Challenge" goes straight to its own level map, same as before.
  appRoot.innerHTML = `
    <div class="topbar">
      <div class="user-block">
        ${avatarHtml}
        <div class="user-meta">
          <p class="greeting">Welcome back</p>
          <p class="name font-display">${displayName}</p>
        </div>
      </div>
      <div class="badge-row" style="align-items:center;">
        <span class="badge">🔥 <span class="val">${profile.streak}</span><span class="unit">day${profile.streak === 1 ? "" : "s"}</span></span>
        <span class="badge">⭐ <span class="val">${profile.xp}</span><span class="unit">XP</span></span>
        <button id="logout-btn" class="btn btn-outline" style="padding:8px 16px; font-size:13px;">Log out</button>
      </div>
    </div>

    <section style="margin-top:40px;">
      <h2 class="font-display" style="font-size:1.6rem; margin:0;">What do you want to practice?</h2>
      <p style="font-size:14px; color: rgba(28,37,33,0.5); margin-top:4px;">
        Pick a mode to get started.
      </p>
      <div class="category-grid" style="margin-top:24px;">
        <a class="category-card" href="#/conversation-categories">
          <span class="category-icon" style="background:var(--mint-50); color:var(--mint-600);">🗨️</span>
          <div style="min-width:0; flex:1;">
            <h3>Conversation Build Challenge</h3>
            <p>Greetings, Shopping, Travel &amp; Daily Conversation</p>
          </div>
          <span class="category-arrow">→</span>
        </a>

        <a class="category-card" href="#/fill-blank">
          <span class="category-icon" style="background:#FFF3E4; color:#F5A623;">✏️</span>
          <div style="min-width:0; flex:1;">
            <h3>Fill in the Blank</h3>
            <p>Pick the word that completes the sentence</p>
          </div>
          <span class="category-arrow">→</span>
        </a>

        <a class="category-card" href="#/sentence-correction">
          <span class="category-icon" style="background:#FDE9E5; color:var(--coral-600);">🛠️</span>
          <div style="min-width:0; flex:1;">
            <h3>Sentence Correction</h3>
            <p>Spot the grammatically correct sentence</p>
          </div>
          <span class="category-arrow">→</span>
        </a>

        <a class="category-card" href="#/speech-practice">
          <span class="category-icon" style="background:var(--mint-50); color:var(--mint-600);">🎤</span>
          <div style="min-width:0; flex:1;">
            <h3>Speech Practice</h3>
            <p>Speak sentences aloud, get instant pronunciation feedback</p>
          </div>
          <span class="category-arrow">→</span>
        </a>

        <a class="category-card" href="#/challenge">
          <span class="category-icon" style="background:var(--plum-50); color:var(--plum-600);">🇮🇳</span>
          <div style="min-width:0; flex:1;">
            <h3>Tamil → English Challenge</h3>
            <p>Type the English translation, AI checks it instantly</p>
          </div>
          <span class="category-arrow">→</span>
        </a>
      </div>
    </section>
  `;

  document.getElementById("logout-btn").addEventListener("click", signOut);
}

/* ---------------------------------------------------------------------
   VIEW: conversation-categories
   The 4 topic categories, now one level deeper than the dashboard.
   Opened from the "Conversation Build Challenge" card above.
   (This is the grid that used to live directly on the dashboard.)
--------------------------------------------------------------------- */
async function renderConversationCategories() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading categories…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const { data: categories } = await db
    .from("categories")
    .select("id, name, icon, sort_order")
    .order("sort_order", { ascending: true });

  const { data: levels } = await db.from("levels").select("id, category_id");

  const { data: progress } = await db
    .from("user_progress")
    .select("level_id")
    .eq("user_id", user.id)
    .eq("completed", true);

  const completedLevelIds = new Set((progress || []).map((p) => p.level_id));

  const categoriesWithProgress = (categories || []).map((cat) => {
    const catLevels = (levels || []).filter((l) => l.category_id === cat.id);
    const completed = catLevels.filter((l) => completedLevelIds.has(l.id)).length;
    return Object.assign({}, cat, { totalLevels: catLevels.length, completedLevels: completed });
  });

  const cardsHtml = categoriesWithProgress
    .map((cat) => {
      const accent = CATEGORY_ACCENTS[cat.id] || { bg: "var(--plum-50)", fg: "var(--plum-600)" };
      const pct = cat.totalLevels > 0 ? Math.round((cat.completedLevels / cat.totalLevels) * 100) : 0;
      return `
        <a class="category-card" href="#/category?id=${encodeURIComponent(cat.id)}">
          <span class="category-icon" style="background:${accent.bg}; color:${accent.fg};">${cat.icon || "💬"}</span>
          <div style="min-width:0; flex:1;">
            <h3>${cat.name}</h3>
            <p>${cat.completedLevels}/${cat.totalLevels} levels complete</p>
            <div class="mini-bar"><div style="width:${pct}%;"></div></div>
          </div>
          <span class="category-arrow">→</span>
        </a>`;
    })
    .join("");

  appRoot.innerHTML = `
    <a class="back-link" href="#/dashboard">← Dashboard</a>
    <section style="margin-top:16px;">
      <h2 class="font-display" style="font-size:1.6rem; margin:0;">Conversation Build Challenge</h2>
      <p style="font-size:14px; color: rgba(28,37,33,0.5); margin-top:4px;">
        Pick a topic — each one builds up in short, real-life exchanges.
      </p>
      <div class="category-grid" style="margin-top:24px;">
        ${cardsHtml || "<p>No categories yet — run scripts/generate-questions.js first.</p>"}
      </div>
    </section>
  `;
}

/* ---------------------------------------------------------------------
   VIEW: category  (was js/category.js)
--------------------------------------------------------------------- */
async function renderCategory(params) {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading levels…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const categoryId = params.get("id");
  if (!categoryId) {
    navigate("dashboard");
    return;
  }

  const { data: category } = await db.from("categories").select("*").eq("id", categoryId).single();
  if (!category) {
    appRoot.innerHTML = `<p>Category not found.</p>`;
    return;
  }

  const { data: levels } = await db
    .from("levels")
    .select("*")
    .eq("category_id", categoryId)
    .order("level_number", { ascending: true });

  const { data: progress } = await db
    .from("user_progress")
    .select("level_id")
    .eq("user_id", user.id)
    .eq("completed", true);

  const completedLevelIds = new Set((progress || []).map((p) => p.level_id));
  const allLevels = levels || [];

  const nodesHtml = allLevels
    .map((level, i) => {
      const isCompleted = completedLevelIds.has(level.id);
      const prevCompleted = i === 0 || completedLevelIds.has(allLevels[i - 1].id);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="#/play?levelId=${encodeURIComponent(level.id)}"`;
      if (status === "locked") {
        inner = "🔒";
        tag = "div";
        href = "";
      } else if (status === "completed") {
        inner = "✓";
      }

      return `
        <li style="display:flex; flex-direction:column; align-items:center; gap:8px; list-style:none;">
          <${tag} class="level-node ${status}" ${href}>${inner}</${tag}>
          <span class="level-label">${level.title || ""}</span>
        </li>`;
    })
    .join("");

  const completedCount = allLevels.filter((l) => completedLevelIds.has(l.id)).length;

  appRoot.innerHTML = `
    <a class="back-link" href="#/conversation-categories">← Categories</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:var(--plum-50); width:48px; height:48px;">${category.icon || "💬"}</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">${category.name}</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${allLevels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      allLevels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/generate-questions.js to generate this category's questions.
           </p>`
    }
  `;
}

/* ---------------------------------------------------------------------
   VIEW: play  (was js/play.js)
--------------------------------------------------------------------- */
const XP_PER_CORRECT = 10;

// Mutable game state for the play view, reset each time renderPlay runs.
let playState = null;

async function renderPlay(params) {
  appRoot.className = "container narrow";
  appRoot.style.minHeight = "100vh";
  appRoot.style.display = "flex";
  appRoot.style.flexDirection = "column";
  appRoot.innerHTML = `<div class="loading-state">Loading level…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;

  playState = {
    user: result.user,
    level: null,
    questions: [],
    index: 0,
    hearts: 3,
    xpEarned: 0,
    selected: null,
    status: "answering",
    busy: false,
  };

  const levelId = params.get("levelId");
  if (!levelId) {
    navigate("dashboard");
    return;
  }

  const { data: level } = await db.from("levels").select("*").eq("id", levelId).single();
  if (!level) {
    appRoot.innerHTML = "<p>Level not found.</p>";
    return;
  }
  playState.level = level;

  if (result.profile.hearts <= 0) {
    navigate("level-failed", { categoryId: level.category_id });
    return;
  }
  playState.hearts = result.profile.hearts;

  if (level.level_number > 1) {
    const { data: prevLevel } = await db
      .from("levels")
      .select("id")
      .eq("category_id", level.category_id)
      .eq("level_number", level.level_number - 1)
      .single();

    if (prevLevel) {
      const { data: prevProgress } = await db
        .from("user_progress")
        .select("completed")
        .eq("user_id", playState.user.id)
        .eq("level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        navigate("category", { id: level.category_id });
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("questions")
    .select("*")
    .eq("level_id", level.id)
    .order("sort_order", { ascending: true });

  playState.questions = questions || [];
  playRenderShell();
  playRenderQuestion();
}

function playRenderShell() {
  appRoot.innerHTML = `
    <header class="play-header">
      <button class="exit-btn" id="exit-btn" aria-label="Exit level">✕</button>
      <div class="progress-bar"><div id="progress-fill" style="width:0%;"></div></div>
      <div class="hearts" id="hearts-display"></div>
    </header>
    <div class="question-area" id="question-area"></div>
    <div class="options" id="options-area"></div>
  `;
  document.getElementById("exit-btn").addEventListener("click", () => {
    navigate("category", { id: playState.level.category_id });
  });
}

function playRenderHearts(shake) {
  const full = "❤️".repeat(playState.hearts);
  const empty = "🤍".repeat(Math.max(0, 3 - playState.hearts));
  const el = document.getElementById("hearts-display");
  el.className = "hearts" + (shake ? " shake" : "");
  el.textContent = full + empty;
}

function playRenderProgress() {
  const pct = playState.questions.length > 0 ? Math.round((playState.index / playState.questions.length) * 100) : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
}

function playRenderQuestion() {
  const question = playState.questions[playState.index];
  playRenderHearts(false);
  playRenderProgress();

  if (!question) {
    document.getElementById("question-area").innerHTML =
      '<p style="color: rgba(28,37,33,0.5);">No questions available for this level yet.</p>';
    document.getElementById("options-area").innerHTML = "";
    return;
  }

  document.getElementById("question-area").innerHTML = `
    <div class="bubble-row">
      <div class="bubble theirs">${escapeHtml(question.question_text)}</div>
    </div>
  `;

  document.getElementById("options-area").innerHTML = question.options
    .map((opt) => `<button class="option-btn" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`)
    .join("");

  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => playHandleSelect(btn.dataset.option));
  });
}

async function playLoseHeart() {
  playState.hearts -= 1;
  const updates =
    playState.hearts <= 0
      ? { hearts: 0, last_heart_lost_at: new Date().toISOString() }
      : { hearts: playState.hearts };
  await db.from("profiles").update(updates).eq("id", playState.user.id);
  return playState.hearts;
}

async function playAwardXp() {
  playState.xpEarned += XP_PER_CORRECT;
  const { data } = await db.from("profiles").select("xp").eq("id", playState.user.id).single();
  const currentXp = data ? data.xp : 0;
  await db.from("profiles").update({ xp: currentXp + XP_PER_CORRECT }).eq("id", playState.user.id);
}

async function playMarkLevelComplete() {
  await db.from("user_progress").upsert(
    {
      user_id: playState.user.id,
      level_id: playState.level.id,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" }
  );
}

async function playHandleSelect(option) {
  if (playState.busy || playState.status !== "answering") return;
  playState.busy = true;
  playState.selected = option;

  const question = playState.questions[playState.index];
  const isCorrect = option === question.correct_answer;

  document.querySelectorAll(".option-btn").forEach((btn) => {
    const isThis = btn.dataset.option === option;
    const isAnswer = btn.dataset.option === question.correct_answer;
    btn.disabled = true;
    if (isAnswer && (isThis || !isCorrect)) btn.classList.add("correct");
    else if (isThis && !isCorrect) btn.classList.add("wrong");
    else btn.classList.add("dim");
  });

  if (isCorrect) {
    playState.status = "correct";
    playSound("correct");
    await playAwardXp();

    setTimeout(async () => {
      const isLast = playState.index === playState.questions.length - 1;
      if (isLast) {
        playSound("complete");
        await playMarkLevelComplete();
        navigate("level-complete", {
          levelId: playState.level.id,
          categoryId: playState.level.category_id,
          xp: playState.xpEarned,
          hearts: playState.hearts,
        });
      } else {
        playState.index += 1;
        playState.selected = null;
        playState.status = "answering";
        playState.busy = false;
        playRenderQuestion();
      }
    }, 700);
  } else {
    playState.status = "wrong";
    playSound("wrong");
    playRenderHearts(true);
    const remaining = await playLoseHeart();

    setTimeout(() => {
      if (remaining <= 0) {
        navigate("level-failed", { categoryId: playState.level.category_id });
      } else {
        playState.selected = null;
        playState.status = "answering";
        playState.busy = false;
        playRenderQuestion();
      }
    }, 900);
  }
}

/* ---------------------------------------------------------------------
   VIEW: level-complete  (was js/level-complete.js)
--------------------------------------------------------------------- */
async function renderLevelComplete(params) {
  appRoot.className = "summary-screen";
  appRoot.innerHTML = "";

  const result = await requireAuthAndProfile();
  if (!result) return;

  const levelId = params.get("levelId");
  const categoryId = params.get("categoryId");
  const xpEarned = Number(params.get("xp")) || 0;
  const heartsRemaining = params.has("hearts") ? Number(params.get("hearts")) : 3;

  let nextLevel = null;
  if (levelId) {
    const { data: currentLevel } = await db
      .from("levels")
      .select("level_number, category_id")
      .eq("id", levelId)
      .single();

    if (currentLevel) {
      const { data: next } = await db
        .from("levels")
        .select("id, title")
        .eq("category_id", currentLevel.category_id)
        .eq("level_number", currentLevel.level_number + 1)
        .single();
      nextLevel = next;
    }
  }

  const heartsHtml = "❤️".repeat(heartsRemaining) + "🤍".repeat(Math.max(0, 3 - heartsRemaining));

  appRoot.innerHTML = `
    <div class="summary-card">
      <div class="summary-icon" style="background: var(--mint-50);">🎉</div>
      <h1 class="font-display">Level complete!</h1>
      <p class="sub">Nice conversation. Here's how it went.</p>
      <div class="summary-stats">
        <div>
          <div class="num">+${xpEarned}</div>
          <div class="label">XP earned</div>
        </div>
        <div>
          <div style="font-size:20px;">${heartsHtml}</div>
          <div class="label">hearts left</div>
        </div>
      </div>
      <div class="summary-actions">
        ${
          nextLevel
            ? `<a class="btn btn-primary btn-block" href="#/play?levelId=${encodeURIComponent(nextLevel.id)}">Next level</a>`
            : ""
        }
        <a class="btn btn-outline btn-block" href="#/category?id=${encodeURIComponent(categoryId || "")}">Back to levels</a>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------
   VIEW: level-failed  (was js/level-failed.js)
--------------------------------------------------------------------- */
let levelFailedCountdownInterval = null;

async function renderLevelFailed(params) {
  appRoot.className = "summary-screen";
  appRoot.innerHTML = "";

  if (levelFailedCountdownInterval) {
    clearInterval(levelFailedCountdownInterval);
    levelFailedCountdownInterval = null;
  }

  const result = await requireAuthAndProfile();
  if (!result) return;

  const categoryId = params.get("categoryId") || "";

  const { data: profile } = await db
    .from("profiles")
    .select("hearts, last_heart_lost_at")
    .eq("id", result.user.id)
    .single();

  const heartsState = getHeartsState(profile ? profile.hearts : 0, profile ? profile.last_heart_lost_at : null);

  const readyBlock = `<div class="num" style="color: var(--mint-600); font-size:1.5rem;">Ready!</div>`;
  const countdownBlock = `
    <p style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color: rgba(28,37,33,0.4); margin-bottom:4px;">Come back in</p>
    <div class="countdown" id="countdown">${formatCountdown(heartsState.msRemaining)}</div>
  `;

  appRoot.innerHTML = `
    <div class="summary-card">
      <div class="summary-icon" style="background:#FDE9E5;">💔</div>
      <h1 class="font-display">Out of hearts</h1>
      <p class="sub">${
        heartsState.hearts > 0
          ? "Your hearts are back — you're good to go."
          : "Take a break. Your hearts refill on their own."
      }</p>
      <div style="margin:24px 0;">
        ${heartsState.hearts > 0 ? readyBlock : countdownBlock}
      </div>
      <div class="summary-actions">
        ${
          heartsState.hearts > 0
            ? `<a class="btn btn-primary btn-block" href="#/category?id=${encodeURIComponent(categoryId)}">Keep practicing</a>`
            : ""
        }
        <a class="btn btn-outline btn-block" href="#/dashboard">Back to dashboard</a>
      </div>
    </div>
  `;

  if (heartsState.hearts <= 0) {
    let msRemaining = heartsState.msRemaining;
    levelFailedCountdownInterval = setInterval(() => {
      msRemaining -= 1000;
      const el = document.getElementById("countdown");
      if (msRemaining <= 0) {
        clearInterval(levelFailedCountdownInterval);
        renderLevelFailed(params); // hearts have refilled server-side by now
        return;
      }
      if (el) el.textContent = formatCountdown(msRemaining);
    }, 1000);
  }
}

/* ---------------------------------------------------------------------
   VIEW: challenge  (was js/challenge.js)
--------------------------------------------------------------------- */
async function renderChallenge() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading levels…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const { data: levels } = await db
    .from("challenge_levels")
    .select("*")
    .order("level_number", { ascending: true });

  const { data: progress } = await db
    .from("challenge_progress")
    .select("challenge_level_id, completed, score")
    .eq("user_id", user.id);

  const progressMap = new Map((progress || []).map((p) => [p.challenge_level_id, p]));
  const allLevels = levels || [];

  const nodesHtml = allLevels
    .map((level, i) => {
      const prog = progressMap.get(level.id);
      const isCompleted = prog && prog.completed;
      const prevCompleted =
        i === 0 || (progressMap.get(allLevels[i - 1].id) && progressMap.get(allLevels[i - 1].id).completed);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="#/play-challenge?levelId=${encodeURIComponent(level.id)}"`;
      if (status === "locked") {
        inner = "🔒";
        tag = "div";
        href = "";
      } else if (status === "completed") {
        inner = "✓";
      }

      const scoreLabel = prog ? ` · ${prog.score}/5` : "";

      return `
        <li style="display:flex; flex-direction:column; align-items:center; gap:8px; list-style:none;">
          <${tag} class="level-node ${status}" ${href}>${inner}</${tag}>
          <span class="level-label">${level.title || ""}${scoreLabel}</span>
        </li>`;
    })
    .join("");

  const completedCount = allLevels.filter((l) => {
    const p = progressMap.get(l.id);
    return p && p.completed;
  }).length;

  appRoot.innerHTML = `
    <a class="back-link" href="#/dashboard">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:var(--plum-50); width:48px; height:48px;">🇮🇳</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">Tamil → English Challenge</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${allLevels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      allLevels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/seed-challenge-questions.js first.
           </p>`
    }
  `;
}

/* ---------------------------------------------------------------------
   VIEW: play-challenge  (was js/play-challenge.js)
--------------------------------------------------------------------- */
let challengeState = null;

async function renderPlayChallenge(params) {
  appRoot.className = "container narrow";
  appRoot.style.minHeight = "100vh";
  appRoot.style.display = "flex";
  appRoot.style.flexDirection = "column";
  appRoot.innerHTML = `<div class="loading-state">Loading level…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;

  challengeState = {
    user: result.user,
    level: null,
    questions: [],
    index: 0,
    correctCount: 0,
    busy: false,
  };

  const levelId = params.get("levelId");
  if (!levelId) {
    navigate("challenge");
    return;
  }

  const { data: level } = await db.from("challenge_levels").select("*").eq("id", levelId).single();
  if (!level) {
    appRoot.innerHTML = "<p>Level not found.</p>";
    return;
  }
  challengeState.level = level;

  if (level.level_number > 1) {
    const { data: prevLevel } = await db
      .from("challenge_levels")
      .select("id")
      .eq("level_number", level.level_number - 1)
      .single();

    if (prevLevel) {
      const { data: prevProgress } = await db
        .from("challenge_progress")
        .select("completed")
        .eq("user_id", challengeState.user.id)
        .eq("challenge_level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        navigate("challenge");
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("challenge_questions")
    .select("*")
    .eq("challenge_level_id", level.id)
    .order("sort_order", { ascending: true });

  challengeState.questions = questions || [];
  challengeRenderQuestion();
}

function challengeRenderShell(bodyHtml) {
  appRoot.innerHTML = `
    <header class="play-header">
      <a class="exit-btn" href="#/challenge" aria-label="Exit level">✕</a>
      <div class="progress-bar"><div style="width:${
        challengeState.questions.length > 0
          ? Math.round((challengeState.index / challengeState.questions.length) * 100)
          : 0
      }%;"></div></div>
    </header>
    ${bodyHtml}
  `;
}

function challengeRenderQuestion() {
  const question = challengeState.questions[challengeState.index];

  if (!question) {
    challengeRenderShell('<p style="color: rgba(28,37,33,0.5);">No questions in this level yet.</p>');
    return;
  }

  challengeRenderShell(`
    <div class="bubble-row">
      <div class="bubble theirs" style="font-size:18px;">${escapeHtml(question.tamil_sentence)}</div>
    </div>
    <p style="font-size:13px; color: rgba(28,37,33,0.5); margin: 4px 0 16px;">Type the English translation:</p>
    <textarea id="answer-input" rows="3" placeholder="Type your answer here…"
      style="width:100%; border:2px solid var(--line); border-radius:16px; padding:12px 16px; font-family:inherit; font-size:15px; resize:none;"
    ></textarea>
    <button id="submit-btn" class="btn btn-primary btn-block" style="margin-top:16px;">Check answer</button>
  `);

  document.getElementById("submit-btn").addEventListener("click", challengeHandleSubmit);
  document.getElementById("answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) challengeHandleSubmit();
  });
}

// Normalizes for loose matching: lowercase, trim, drop trailing
// punctuation, collapse extra whitespace.
function challengeNormalize(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ");
}

// Checks the student's answer against the stored correct answer and any
// extra accepted variations (question.accepted_answers, a jsonb array —
// optional column, see scripts/new-challenges-schema.sql). Returns true
// only on a confident local match, so most correct answers never need
// to call the AI at all.
function challengeLocalMatch(studentAnswer, question) {
  const normalizedStudent = challengeNormalize(studentAnswer);
  const candidates = [question.correct_answer_en].concat(question.accepted_answers || []);
  return candidates.some((c) => challengeNormalize(c) === normalizedStudent);
}

async function challengeHandleSubmit() {
  if (challengeState.busy) return;
  const input = document.getElementById("answer-input");
  const studentAnswer = input.value.trim();
  if (!studentAnswer) {
    input.focus();
    return;
  }

  challengeState.busy = true;
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Checking…";

  const question = challengeState.questions[challengeState.index];

  let result;

  // Fast path: exact/near-exact match against stored answers — no AI
  // call needed at all. This is what most correct submissions hit.
  if (challengeLocalMatch(studentAnswer, question)) {
    result = {
      correct: true,
      correctSentence: question.correct_answer_en,
      grammarExplanation: "Matches the expected answer.",
      vocabularyExplanation: "",
      marks: 10,
    };
  } else {
    // Only call the AI when the local check can't confirm it — this is
    // the one place that still costs an API call, and only for
    // answers that need real grammar feedback.
    try {
      const res = await fetch("/api/check-challenge-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tamilSentence: question.tamil_sentence,
          correctAnswer: question.correct_answer_en,
          studentAnswer,
        }),
      });
      result = await res.json();
      if (result.error) throw new Error(result.error);
    } catch (err) {
      challengeRenderShell(`
        <p style="color: var(--coral-600);">Could not check your answer right now.</p>
        <p style="font-size:13px; color: rgba(28,37,33,0.5);">${escapeHtml(err.message || "")}</p>
        <p style="font-size:13px; color: rgba(28,37,33,0.5); margin-top:8px;">
          (This feature needs the app to be deployed with the API route + GROQ_API_KEY set —
          it won't work from a plain static file server.)
        </p>
        <button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="challengeRenderQuestion()">Try again</button>
      `);
      challengeState.busy = false;
      return;
    }
  }

  await challengeRecordAttempt(question, studentAnswer, result);

  if (result.correct) challengeState.correctCount += 1;

  const xpChange = result.correct ? 10 : 2;
  await challengeAwardXp(xpChange);
  playSound(result.correct ? "correct" : "wrong");

  challengeRenderShell(`
    <div class="summary-card" style="margin: 0 auto;">
      <div class="summary-icon" style="background:${result.correct ? "var(--mint-50)" : "#FFF0ED"};">
        ${result.correct ? "✅" : "❌"}
      </div>
      <h1 class="font-display" style="font-size:1.3rem;">${result.correct ? "Correct!" : "Not quite"}</h1>
      <p class="sub" style="text-align:left; margin-top:16px;"><strong>Correct sentence:</strong> ${escapeHtml(result.correctSentence || question.correct_answer_en)}</p>
      <p class="sub" style="text-align:left; margin-top:8px;"><strong>Grammar:</strong> ${escapeHtml(result.grammarExplanation || "")}</p>
      <p class="sub" style="text-align:left; margin-top:8px;"><strong>Vocabulary:</strong> ${escapeHtml(result.vocabularyExplanation || "")}</p>
      <p class="sub" style="text-align:left; margin-top:8px;"><strong>Marks:</strong> ${result.marks ?? (result.correct ? 10 : 0)}/10 &nbsp;•&nbsp; <strong>+${xpChange} XP</strong></p>
      <button id="next-btn" class="btn btn-primary btn-block" style="margin-top:20px;">
        ${challengeState.index === challengeState.questions.length - 1 ? "Finish level" : "Next question"}
      </button>
    </div>
  `);

  document.getElementById("next-btn").addEventListener("click", challengeGoToNext);
  challengeState.busy = false;
}

async function challengeRecordAttempt(question, studentAnswer, result) {
  await db.from("challenge_attempts").insert({
    user_id: challengeState.user.id,
    challenge_question_id: question.id,
    student_answer: studentAnswer,
    is_correct: !!result.correct,
    correct_sentence: result.correctSentence || question.correct_answer_en,
    grammar_explanation: result.grammarExplanation || null,
    vocabulary_explanation: result.vocabularyExplanation || null,
    marks: result.marks ?? (result.correct ? 10 : 0),
  });
}

async function challengeAwardXp(amount) {
  const { data } = await db.from("profiles").select("xp").eq("id", challengeState.user.id).single();
  const currentXp = data ? data.xp : 0;
  await db.from("profiles").update({ xp: currentXp + amount }).eq("id", challengeState.user.id);
  await db.from("xp_log").insert({
    user_id: challengeState.user.id,
    amount,
    reason: amount >= 10 ? "challenge_correct" : "challenge_wrong",
  });
}

async function challengeGoToNext() {
  const isLast = challengeState.index === challengeState.questions.length - 1;

  if (isLast) {
    await db.from("challenge_progress").upsert(
      {
        user_id: challengeState.user.id,
        challenge_level_id: challengeState.level.id,
        completed: true,
        score: challengeState.correctCount,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,challenge_level_id" }
    );
    playSound("complete");
    navigate("challenge");
  } else {
    challengeState.index += 1;
    challengeRenderQuestion();
  }
}

/* =========================================================================
   FILL IN THE BLANK
   Same interaction pattern as the regular "play" view (pick one of 3
   options, instant correct/wrong highlight) — no AI calls, no hearts.
   Content lives in blank_levels / blank_questions (see
   scripts/new-challenges-schema.sql).
   ========================================================================= */
async function renderFillBlankLevels() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading levels…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const { data: levels } = await db
    .from("blank_levels")
    .select("*")
    .order("level_number", { ascending: true });

  const { data: progress } = await db
    .from("blank_progress")
    .select("level_id, completed, score")
    .eq("user_id", user.id);

  const progressMap = new Map((progress || []).map((p) => [p.level_id, p]));
  const allLevels = levels || [];

  const nodesHtml = allLevels
    .map((level, i) => {
      const prog = progressMap.get(level.id);
      const isCompleted = prog && prog.completed;
      const prevCompleted =
        i === 0 || (progressMap.get(allLevels[i - 1].id) && progressMap.get(allLevels[i - 1].id).completed);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="#/play-fill-blank?levelId=${encodeURIComponent(level.id)}"`;
      if (status === "locked") {
        inner = "🔒";
        tag = "div";
        href = "";
      } else if (status === "completed") {
        inner = "✓";
      }

      const scoreLabel = prog ? ` · ${prog.score}/3` : "";

      return `
        <li style="display:flex; flex-direction:column; align-items:center; gap:8px; list-style:none;">
          <${tag} class="level-node ${status}" ${href}>${inner}</${tag}>
          <span class="level-label">${level.title || ""}${scoreLabel}</span>
        </li>`;
    })
    .join("");

  const completedCount = allLevels.filter((l) => {
    const p = progressMap.get(l.id);
    return p && p.completed;
  }).length;

  appRoot.innerHTML = `
    <a class="back-link" href="#/dashboard">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:#FFF3E4; width:48px; height:48px;">✏️</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">Fill in the Blank</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${allLevels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      allLevels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/new-challenges-schema.sql first.
           </p>`
    }
  `;
}

let blankState = null;

async function renderPlayFillBlank(params) {
  appRoot.className = "container narrow";
  appRoot.style.minHeight = "100vh";
  appRoot.style.display = "flex";
  appRoot.style.flexDirection = "column";
  appRoot.innerHTML = `<div class="loading-state">Loading level…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;

  blankState = { user: result.user, level: null, questions: [], index: 0, correctCount: 0, busy: false };

  const levelId = params.get("levelId");
  if (!levelId) {
    navigate("fill-blank");
    return;
  }

  const { data: level } = await db.from("blank_levels").select("*").eq("id", levelId).single();
  if (!level) {
    appRoot.innerHTML = "<p>Level not found.</p>";
    return;
  }
  blankState.level = level;

  if (level.level_number > 1) {
    const { data: prevLevel } = await db
      .from("blank_levels")
      .select("id")
      .eq("level_number", level.level_number - 1)
      .single();

    if (prevLevel) {
      const { data: prevProgress } = await db
        .from("blank_progress")
        .select("completed")
        .eq("user_id", blankState.user.id)
        .eq("level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        navigate("fill-blank");
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("blank_questions")
    .select("*")
    .eq("level_id", level.id)
    .order("sort_order", { ascending: true });

  blankState.questions = questions || [];
  blankRenderShell();
  blankRenderQuestion();
}

function blankRenderShell() {
  appRoot.innerHTML = `
    <header class="play-header">
      <a class="exit-btn" href="#/fill-blank" aria-label="Exit level">✕</a>
      <div class="progress-bar"><div id="blank-progress-fill" style="width:0%;"></div></div>
    </header>
    <div class="question-area" id="blank-question-area"></div>
    <div class="options" id="blank-options-area"></div>
  `;
}

function blankRenderQuestion() {
  const question = blankState.questions[blankState.index];
  const pct =
    blankState.questions.length > 0 ? Math.round((blankState.index / blankState.questions.length) * 100) : 0;
  document.getElementById("blank-progress-fill").style.width = pct + "%";

  if (!question) {
    document.getElementById("blank-question-area").innerHTML =
      '<p style="color: rgba(28,37,33,0.5);">No questions in this level yet.</p>';
    document.getElementById("blank-options-area").innerHTML = "";
    return;
  }

  // Show the sentence with the blank visually marked.
  const sentenceHtml = escapeHtml(question.sentence_text).replace(
    "___",
    '<strong style="border-bottom:2px solid var(--plum-300);">____</strong>'
  );

  document.getElementById("blank-question-area").innerHTML = `
    <div class="bubble-row">
      <div class="bubble theirs">${sentenceHtml}</div>
    </div>
  `;

  document.getElementById("blank-options-area").innerHTML = question.options
    .map((opt) => `<button class="option-btn" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`)
    .join("");

  document.querySelectorAll("#blank-options-area .option-btn").forEach((btn) => {
    btn.addEventListener("click", () => blankHandleSelect(btn.dataset.option));
  });
}

async function blankFinishLevel() {
  await db.from("blank_progress").upsert(
    {
      user_id: blankState.user.id,
      level_id: blankState.level.id,
      completed: true,
      score: blankState.correctCount,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" }
  );
}

async function blankHandleSelect(option) {
  if (blankState.busy) return;
  blankState.busy = true;

  const question = blankState.questions[blankState.index];
  const isCorrect = option === question.correct_answer;

  document.querySelectorAll("#blank-options-area .option-btn").forEach((btn) => {
    const isThis = btn.dataset.option === option;
    const isAnswer = btn.dataset.option === question.correct_answer;
    btn.disabled = true;
    if (isAnswer && (isThis || !isCorrect)) btn.classList.add("correct");
    else if (isThis && !isCorrect) btn.classList.add("wrong");
    else btn.classList.add("dim");
  });

  if (isCorrect) {
    blankState.correctCount += 1;
    playSound("correct");
    await awardXpTo(blankState.user.id, 10);
  } else {
    playSound("wrong");
  }

  setTimeout(async () => {
    const isLast = blankState.index === blankState.questions.length - 1;
    if (isLast) {
      playSound("complete");
      await blankFinishLevel();
      navigate("fill-blank");
    } else {
      blankState.index += 1;
      blankState.busy = false;
      blankRenderQuestion();
    }
  }, 800);
}

/* =========================================================================
   SENTENCE CORRECTION
   Same pattern again: pick the grammatically correct sentence out of 3.
   Content lives in correction_levels / correction_questions.
   ========================================================================= */
async function renderCorrectionLevels() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading levels…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const { data: levels } = await db
    .from("correction_levels")
    .select("*")
    .order("level_number", { ascending: true });

  const { data: progress } = await db
    .from("correction_progress")
    .select("level_id, completed, score")
    .eq("user_id", user.id);

  const progressMap = new Map((progress || []).map((p) => [p.level_id, p]));
  const allLevels = levels || [];

  const nodesHtml = allLevels
    .map((level, i) => {
      const prog = progressMap.get(level.id);
      const isCompleted = prog && prog.completed;
      const prevCompleted =
        i === 0 || (progressMap.get(allLevels[i - 1].id) && progressMap.get(allLevels[i - 1].id).completed);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="#/play-sentence-correction?levelId=${encodeURIComponent(level.id)}"`;
      if (status === "locked") {
        inner = "🔒";
        tag = "div";
        href = "";
      } else if (status === "completed") {
        inner = "✓";
      }

      const scoreLabel = prog ? ` · ${prog.score}/2` : "";

      return `
        <li style="display:flex; flex-direction:column; align-items:center; gap:8px; list-style:none;">
          <${tag} class="level-node ${status}" ${href}>${inner}</${tag}>
          <span class="level-label">${level.title || ""}${scoreLabel}</span>
        </li>`;
    })
    .join("");

  const completedCount = allLevels.filter((l) => {
    const p = progressMap.get(l.id);
    return p && p.completed;
  }).length;

  appRoot.innerHTML = `
    <a class="back-link" href="#/dashboard">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:#FDE9E5; width:48px; height:48px;">🛠️</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">Sentence Correction</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${allLevels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      allLevels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/new-challenges-schema.sql first.
           </p>`
    }
  `;
}

let correctionState = null;

async function renderPlayCorrection(params) {
  appRoot.className = "container narrow";
  appRoot.style.minHeight = "100vh";
  appRoot.style.display = "flex";
  appRoot.style.flexDirection = "column";
  appRoot.innerHTML = `<div class="loading-state">Loading level…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;

  correctionState = { user: result.user, level: null, questions: [], index: 0, correctCount: 0, busy: false };

  const levelId = params.get("levelId");
  if (!levelId) {
    navigate("sentence-correction");
    return;
  }

  const { data: level } = await db.from("correction_levels").select("*").eq("id", levelId).single();
  if (!level) {
    appRoot.innerHTML = "<p>Level not found.</p>";
    return;
  }
  correctionState.level = level;

  if (level.level_number > 1) {
    const { data: prevLevel } = await db
      .from("correction_levels")
      .select("id")
      .eq("level_number", level.level_number - 1)
      .single();

    if (prevLevel) {
      const { data: prevProgress } = await db
        .from("correction_progress")
        .select("completed")
        .eq("user_id", correctionState.user.id)
        .eq("level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        navigate("sentence-correction");
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("correction_questions")
    .select("*")
    .eq("level_id", level.id)
    .order("sort_order", { ascending: true });

  correctionState.questions = questions || [];
  correctionRenderShell();
  correctionRenderQuestion();
}

function correctionRenderShell() {
  appRoot.innerHTML = `
    <header class="play-header">
      <a class="exit-btn" href="#/sentence-correction" aria-label="Exit level">✕</a>
      <div class="progress-bar"><div id="correction-progress-fill" style="width:0%;"></div></div>
    </header>
    <div class="question-area" id="correction-question-area"></div>
    <div class="options" id="correction-options-area"></div>
  `;
}

function correctionRenderQuestion() {
  const question = correctionState.questions[correctionState.index];
  const pct =
    correctionState.questions.length > 0
      ? Math.round((correctionState.index / correctionState.questions.length) * 100)
      : 0;
  document.getElementById("correction-progress-fill").style.width = pct + "%";

  if (!question) {
    document.getElementById("correction-question-area").innerHTML =
      '<p style="color: rgba(28,37,33,0.5);">No questions in this level yet.</p>';
    document.getElementById("correction-options-area").innerHTML = "";
    return;
  }

  document.getElementById("correction-question-area").innerHTML = `
    <div class="bubble-row">
      <div class="bubble theirs">${escapeHtml(question.incorrect_sentence)}</div>
    </div>
    <p style="font-size:13px; color: rgba(28,37,33,0.5); margin: 4px 0 0;">Which one is correct?</p>
  `;

  document.getElementById("correction-options-area").innerHTML = question.options
    .map((opt) => `<button class="option-btn" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`)
    .join("");

  document.querySelectorAll("#correction-options-area .option-btn").forEach((btn) => {
    btn.addEventListener("click", () => correctionHandleSelect(btn.dataset.option));
  });
}

async function correctionFinishLevel() {
  await db.from("correction_progress").upsert(
    {
      user_id: correctionState.user.id,
      level_id: correctionState.level.id,
      completed: true,
      score: correctionState.correctCount,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" }
  );
}

async function correctionHandleSelect(option) {
  if (correctionState.busy) return;
  correctionState.busy = true;

  const question = correctionState.questions[correctionState.index];
  const isCorrect = option === question.correct_answer;

  document.querySelectorAll("#correction-options-area .option-btn").forEach((btn) => {
    const isThis = btn.dataset.option === option;
    const isAnswer = btn.dataset.option === question.correct_answer;
    btn.disabled = true;
    if (isAnswer && (isThis || !isCorrect)) btn.classList.add("correct");
    else if (isThis && !isCorrect) btn.classList.add("wrong");
    else btn.classList.add("dim");
  });

  if (isCorrect) {
    correctionState.correctCount += 1;
    playSound("correct");
    await awardXpTo(correctionState.user.id, 10);
  } else {
    playSound("wrong");
  }

  setTimeout(async () => {
    const isLast = correctionState.index === correctionState.questions.length - 1;
    if (isLast) {
      playSound("complete");
      await correctionFinishLevel();
      navigate("sentence-correction");
    } else {
      correctionState.index += 1;
      correctionState.busy = false;
      correctionRenderQuestion();
    }
  }, 800);
}

/* ---------------------------------------------------------------------
   Shared XP helper used by the new modes above (kept separate from
   play.js's original playAwardXp so the existing game is untouched).
--------------------------------------------------------------------- */
async function awardXpTo(userId, amount) {
  const { data } = await db.from("profiles").select("xp").eq("id", userId).single();
  const currentXp = data ? data.xp : 0;
  await db.from("profiles").update({ xp: currentXp + amount }).eq("id", userId);
}

/* =========================================================================
   SPEECH PRACTICE
   Uses the browser's built-in SpeechRecognition API to transcribe what
   the user says, then compares it locally to the target sentence.
   No AI/API call involved — everything happens in the browser.
   Best supported in Chrome / Edge; other browsers may not support it.
   ========================================================================= */
async function renderSpeechLevels() {
  appRoot.className = "container narrow";
  appRoot.innerHTML = `<div class="loading-state">Loading levels…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const { data: levels } = await db
    .from("speech_levels")
    .select("*")
    .order("level_number", { ascending: true });

  const { data: progress } = await db
    .from("speech_progress")
    .select("level_id, completed, score")
    .eq("user_id", user.id);

  const progressMap = new Map((progress || []).map((p) => [p.level_id, p]));
  const allLevels = levels || [];

  const nodesHtml = allLevels
    .map((level, i) => {
      const prog = progressMap.get(level.id);
      const isCompleted = prog && prog.completed;
      const prevCompleted =
        i === 0 || (progressMap.get(allLevels[i - 1].id) && progressMap.get(allLevels[i - 1].id).completed);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="#/play-speech?levelId=${encodeURIComponent(level.id)}"`;
      if (status === "locked") {
        inner = "🔒";
        tag = "div";
        href = "";
      } else if (status === "completed") {
        inner = "✓";
      }

      const scoreLabel = prog ? ` · ${prog.score}/7` : "";

      return `
        <li style="display:flex; flex-direction:column; align-items:center; gap:8px; list-style:none;">
          <${tag} class="level-node ${status}" ${href}>${inner}</${tag}>
          <span class="level-label">${level.title || ""}${scoreLabel}</span>
        </li>`;
    })
    .join("");

  const completedCount = allLevels.filter((l) => {
    const p = progressMap.get(l.id);
    return p && p.completed;
  }).length;

  const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  appRoot.innerHTML = `
    <a class="back-link" href="#/dashboard">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:var(--mint-50); width:48px; height:48px;">🎤</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">Speech Practice</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${allLevels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      !speechSupported
        ? `<p style="text-align:center; margin-top:16px; padding:12px; background:#FFF3E4; border-radius:12px; font-size:13px; color: rgba(28,37,33,0.7);">
             ⚠️ Your browser doesn't support speech recognition. Please use Chrome or Edge for this feature.
           </p>`
        : ""
    }

    ${
      allLevels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/speech-schema.sql + speech-content.sql first.
           </p>`
    }
  `;
}

let speechState = null;
let speechRecognizer = null;

// Word-overlap similarity, 0 to 1. No AI — just local text comparison.
// Word-level edit distance (like spell-check, but per word instead of
// per letter). This correctly penalizes a wrong/substituted word,
// unlike a simple "is this word present anywhere" check.
function wordEditDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

function speechSimilarity(said, target) {
  const clean = (s) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const saidWords = clean(said);
  const targetWords = clean(target);
  if (targetWords.length === 0) return 0;

  const distance = wordEditDistance(saidWords, targetWords);
  return Math.max(0, 1 - distance / targetWords.length);
}

async function renderPlaySpeech(params) {
  appRoot.className = "container narrow";
  appRoot.style.minHeight = "100vh";
  appRoot.style.display = "flex";
  appRoot.style.flexDirection = "column";
  appRoot.innerHTML = `<div class="loading-state">Loading level…</div>`;

  const result = await requireAuthAndProfile();
  if (!result) return;

  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionClass) {
    appRoot.innerHTML = `
      <p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.6);">
        ⚠️ Your browser doesn't support speech recognition.<br />Please try this in Chrome or Edge.
      </p>
      <a class="btn btn-outline btn-block" style="margin-top:16px;" href="#/speech-practice">Back to levels</a>
    `;
    return;
  }

  speechState = {
    user: result.user,
    level: null,
    questions: [],
    index: 0,
    correctCount: 0,
    busy: false,
    listening: false,
  };

  const levelId = params.get("levelId");
  if (!levelId) {
    navigate("speech-practice");
    return;
  }

  const { data: level } = await db.from("speech_levels").select("*").eq("id", levelId).single();
  if (!level) {
    appRoot.innerHTML = "<p>Level not found.</p>";
    return;
  }
  speechState.level = level;

  if (level.level_number > 1) {
    const { data: prevLevel } = await db
      .from("speech_levels")
      .select("id")
      .eq("level_number", level.level_number - 1)
      .single();

    if (prevLevel) {
      const { data: prevProgress } = await db
        .from("speech_progress")
        .select("completed")
        .eq("user_id", speechState.user.id)
        .eq("level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        navigate("speech-practice");
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("speech_questions")
    .select("*")
    .eq("level_id", level.id)
    .order("sort_order", { ascending: true });

  speechState.questions = questions || [];

  speechRecognizer = new SpeechRecognitionClass();
  speechRecognizer.lang = "en-US";
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = false;

  speechRenderQuestion();
}

function speechRenderShell(bodyHtml) {
  const pct =
    speechState.questions.length > 0 ? Math.round((speechState.index / speechState.questions.length) * 100) : 0;
  appRoot.innerHTML = `
    <header class="play-header">
      <a class="exit-btn" href="#/speech-practice" aria-label="Exit level">✕</a>
      <div class="progress-bar"><div style="width:${pct}%;"></div></div>
    </header>
    ${bodyHtml}
  `;
}

function speechRenderQuestion() {
  const question = speechState.questions[speechState.index];

  if (!question) {
    speechRenderShell('<p style="color: rgba(28,37,33,0.5);">No sentences in this level yet.</p>');
    return;
  }

  speechRenderShell(`
    <div class="bubble-row">
      <div class="bubble theirs" style="font-size:18px;">${escapeHtml(question.sentence_text)}</div>
    </div>
    <p style="font-size:13px; color: rgba(28,37,33,0.5); margin: 4px 0 20px;">
      Tap the mic and read the sentence out loud.
    </p>
    <button id="mic-btn" class="btn btn-primary btn-block" style="font-size:16px;">
      🎤 Tap to Speak
    </button>
    <p id="mic-status" style="text-align:center; font-size:13px; color: rgba(28,37,33,0.5); margin-top:12px; min-height:18px;"></p>
  `);

  document.getElementById("mic-btn").addEventListener("click", speechStartListening);
}

function speechStartListening() {
  if (speechState.busy || speechState.listening) return;
  speechState.listening = true;

  const micBtn = document.getElementById("mic-btn");
  const status = document.getElementById("mic-status");
  micBtn.textContent = "🔴 Listening…";
  micBtn.disabled = true;
  status.textContent = "Speak now…";

  speechRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    speechHandleResult(transcript);
  };

  speechRecognizer.onerror = (event) => {
    speechState.listening = false;
    micBtn.textContent = "🎤 Tap to Speak";
    micBtn.disabled = false;
    status.textContent =
      event.error === "not-allowed"
        ? "Microphone permission denied. Please allow mic access and try again."
        : "Didn't catch that — tap the mic and try again.";
  };

  speechRecognizer.onend = () => {
    speechState.listening = false;
  };

  try {
    speechRecognizer.start();
  } catch (err) {
    status.textContent = "Could not start the microphone. Try again.";
    micBtn.textContent = "🎤 Tap to Speak";
    micBtn.disabled = false;
    speechState.listening = false;
  }
}

async function speechFinishLevel() {
  await db.from("speech_progress").upsert(
    {
      user_id: speechState.user.id,
      level_id: speechState.level.id,
      completed: true,
      score: speechState.correctCount,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" }
  );
}

async function speechHandleResult(transcript) {
  if (speechState.busy) return;
  speechState.busy = true;

  const question = speechState.questions[speechState.index];
  const similarity = speechSimilarity(transcript, question.sentence_text);
  const isGood = similarity >= 0.85;

  const micBtn = document.getElementById("mic-btn");
  const status = document.getElementById("mic-status");

  if (isGood) {
    speechState.correctCount += 1;
    playSound("correct");
    await awardXpTo(speechState.user.id, 10);
    if (micBtn) micBtn.style.display = "none";
    if (status) {
      status.innerHTML = `
        <span style="color: var(--mint-600); font-weight:600;">✅ Great pronunciation!</span><br/>
        <span style="font-size:12px;">You said: "${escapeHtml(transcript)}"</span>
      `;
    }

    // Only move forward when the answer was correct.
    setTimeout(async () => {
      const isLast = speechState.index === speechState.questions.length - 1;
      if (isLast) {
        playSound("complete");
        await speechFinishLevel();
        navigate("speech-practice");
      } else {
        speechState.index += 1;
        speechState.busy = false;
        speechRenderQuestion();
      }
    }, 1500);
  } else {
    // Wrong — stay on the same question, let them try again.
    playSound("wrong");
    if (status) {
      status.innerHTML = `
        <span style="color: var(--coral-600); font-weight:600;">❌ Not quite — try again.</span><br/>
        <span style="font-size:12px;">You said: "${escapeHtml(transcript)}"</span><br/>
        <span style="font-size:12px;">Target: "${escapeHtml(question.sentence_text)}"</span>
      `;
    }
    if (micBtn) {
      micBtn.textContent = "🎤 Tap to Speak Again";
      micBtn.disabled = false;
      micBtn.style.display = "";
    }
    speechState.busy = false;
  }
}