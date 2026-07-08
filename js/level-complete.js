function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return;

  const levelId = getQueryParam("levelId");
  const categoryId = getQueryParam("categoryId");
  const xpEarned = Number(getQueryParam("xp")) || 0;
  const heartsRemaining = Number(getQueryParam("hearts") ?? 3);

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

  document.getElementById("app").innerHTML = `
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
            ? `<a class="btn btn-primary btn-block" href="play.html?levelId=${encodeURIComponent(nextLevel.id)}">Next level</a>`
            : ""
        }
        <a class="btn btn-outline btn-block" href="category.html?id=${encodeURIComponent(categoryId || "")}">Back to levels</a>
      </div>
    </div>
  `;
}

init();
