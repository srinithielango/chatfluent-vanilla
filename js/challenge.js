async function init() {
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

  render(levels || [], progressMap);
}

function render(levels, progressMap) {
  const nodesHtml = levels
    .map((level, i) => {
      const prog = progressMap.get(level.id);
      const isCompleted = prog && prog.completed;
      const prevCompleted =
        i === 0 || (progressMap.get(levels[i - 1].id) && progressMap.get(levels[i - 1].id).completed);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="play-challenge.html?levelId=${encodeURIComponent(level.id)}"`;
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

  const completedCount = levels.filter((l) => {
    const p = progressMap.get(l.id);
    return p && p.completed;
  }).length;

  document.getElementById("app").innerHTML = `
    <a class="back-link" href="dashboard.html">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:var(--plum-50); width:48px; height:48px;">🇮🇳</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">Tamil → English Challenge</h1>
          <p style="font-size:14px; color: rgba(28,37,33,0.5); margin:2px 0 0;">
            ${completedCount}/${levels.length} levels complete
          </p>
        </div>
      </div>
    </div>

    ${
      levels.length > 0
        ? `<ol class="level-map">${nodesHtml}</ol>`
        : `<p style="text-align:center; margin-top:40px; color: rgba(28,37,33,0.5); font-size:14px;">
             No levels yet — run scripts/seed-challenge-questions.js first.
           </p>`
    }
  `;
}

init();