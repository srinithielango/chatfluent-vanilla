const CATEGORY_ACCENTS = {
  greetings: { bg: "var(--mint-50)", fg: "var(--mint-600)" },
  shopping: { bg: "var(--plum-50)", fg: "var(--plum-600)" },
  travel: { bg: "#FFF3E4", fg: "#F5A623" },
  "daily-conversation": { bg: "#FDE9E5", fg: "var(--coral-600)" },
};

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return; // already redirected to login
  const { user, profile } = result;

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

  render(user, profile, categoriesWithProgress);
}

function render(user, profile, categories) {
  const displayName = (profile.full_name || "there").split(" ")[0];
  const avatarHtml = profile.avatar_url
    ? `<img class="avatar" src="${profile.avatar_url}" alt="" />`
    : `<span class="avatar-fallback">${displayName[0].toUpperCase()}</span>`;

  const cardsHtml = categories
    .map((cat) => {
      const accent = CATEGORY_ACCENTS[cat.id] || { bg: "var(--plum-50)", fg: "var(--plum-600)" };
      const pct = cat.totalLevels > 0 ? Math.round((cat.completedLevels / cat.totalLevels) * 100) : 0;
      return `
        <a class="category-card" href="category.html?id=${encodeURIComponent(cat.id)}">
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

  document.getElementById("app").innerHTML = `
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
        Pick a topic — each one builds up in short, real-life exchanges.
      </p>
      <div class="category-grid">
        ${cardsHtml || "<p>No categories yet — run scripts/generate-questions.js first.</p>"}
      </div>
    </section>

    <section style="margin-top:32px;">
      <a class="category-card" href="challenge.html">
        <span class="category-icon" style="background:var(--plum-50); color:var(--plum-600);">🇮🇳</span>
        <div style="min-width:0; flex:1;">
          <h3>Tamil → English Challenge</h3>
          <p>Type the English translation, AI checks it instantly</p>
        </div>
        <span class="category-arrow">→</span>
      </a>
    </section>
  `;

  document.getElementById("logout-btn").addEventListener("click", signOut);
}

init();