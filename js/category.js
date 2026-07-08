function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return;
  const { user } = result;

  const categoryId = getQueryParam("id");
  if (!categoryId) {
    window.location.href = "dashboard.html";
    return;
  }

  const { data: category } = await db.from("categories").select("*").eq("id", categoryId).single();
  if (!category) {
    document.getElementById("app").innerHTML = `<p>Category not found.</p>`;
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

  render(category, levels || [], completedLevelIds);
}

function render(category, levels, completedLevelIds) {
  const nodesHtml = levels
    .map((level, i) => {
      const isCompleted = completedLevelIds.has(level.id);
      const prevCompleted = i === 0 || completedLevelIds.has(levels[i - 1].id);
      const status = isCompleted ? "completed" : prevCompleted ? "unlocked" : "locked";

      let inner = level.level_number;
      let tag = "a";
      let href = `href="play.html?levelId=${encodeURIComponent(level.id)}"`;
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

  const completedCount = levels.filter((l) => completedLevelIds.has(l.id)).length;

  document.getElementById("app").innerHTML = `
    <a class="back-link" href="dashboard.html">← Dashboard</a>
    <div class="topbar" style="margin-top:16px;">
      <div class="user-block">
        <span class="category-icon" style="background:var(--plum-50); width:48px; height:48px;">${category.icon || "💬"}</span>
        <div>
          <h1 class="font-display" style="font-size:1.6rem; margin:0;">${category.name}</h1>
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
             No levels yet — run scripts/generate-questions.js to generate this category's questions.
           </p>`
    }
  `;
}

init();
