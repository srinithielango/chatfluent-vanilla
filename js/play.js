const XP_PER_CORRECT = 10;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Mutable game state, all in one place.
const state = {
  user: null,
  level: null,
  questions: [],
  index: 0,
  hearts: 3,
  xpEarned: 0,
  selected: null,
  status: "answering", // answering | correct | wrong
  busy: false,
};

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return;
  state.user = result.user;

  const levelId = getQueryParam("levelId");
  if (!levelId) {
    window.location.href = "dashboard.html";
    return;
  }

  const { data: level } = await db.from("levels").select("*").eq("id", levelId).single();
  if (!level) {
    document.getElementById("app").innerHTML = "<p>Level not found.</p>";
    return;
  }
  state.level = level;

  // Out of hearts -> send to the cooldown screen instead of playing.
  if (result.profile.hearts <= 0) {
    window.location.href = `level-failed.html?categoryId=${encodeURIComponent(level.category_id)}`;
    return;
  }
  state.hearts = result.profile.hearts;

  // Enforce level unlock order.
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
        .eq("user_id", state.user.id)
        .eq("level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        window.location.href = `category.html?id=${encodeURIComponent(level.category_id)}`;
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("questions")
    .select("*")
    .eq("level_id", level.id)
    .order("sort_order", { ascending: true });

  state.questions = questions || [];
  renderShell();
  renderQuestion();
}

function renderShell() {
  document.getElementById("app").innerHTML = `
    <header class="play-header">
      <button class="exit-btn" id="exit-btn" aria-label="Exit level">✕</button>
      <div class="progress-bar"><div id="progress-fill" style="width:0%;"></div></div>
      <div class="hearts" id="hearts-display"></div>
    </header>
    <div class="question-area" id="question-area"></div>
    <div class="options" id="options-area"></div>
  `;
  document.getElementById("exit-btn").addEventListener("click", () => {
    window.location.href = `category.html?id=${encodeURIComponent(state.level.category_id)}`;
  });
}

function renderHearts(shake) {
  const full = "❤️".repeat(state.hearts);
  const empty = "🤍".repeat(Math.max(0, 3 - state.hearts));
  const el = document.getElementById("hearts-display");
  el.className = "hearts" + (shake ? " shake" : "");
  el.textContent = full + empty;
}

function renderProgress() {
  const pct = state.questions.length > 0 ? Math.round((state.index / state.questions.length) * 100) : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
}

function renderQuestion() {
  const question = state.questions[state.index];
  renderHearts(false);
  renderProgress();

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
    .map(
      (opt) =>
        `<button class="option-btn" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
    )
    .join("");

  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleSelect(btn.dataset.option));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loseHeart() {
  state.hearts -= 1;
  const updates =
    state.hearts <= 0
      ? { hearts: 0, last_heart_lost_at: new Date().toISOString() }
      : { hearts: state.hearts };
  await db.from("profiles").update(updates).eq("id", state.user.id);
  return state.hearts;
}

async function awardXp() {
  state.xpEarned += XP_PER_CORRECT;
  const { data } = await db.from("profiles").select("xp").eq("id", state.user.id).single();
  const currentXp = data ? data.xp : 0;
  await db.from("profiles").update({ xp: currentXp + XP_PER_CORRECT }).eq("id", state.user.id);
}

async function markLevelComplete() {
  await db.from("user_progress").upsert(
    {
      user_id: state.user.id,
      level_id: state.level.id,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" }
  );
}

async function handleSelect(option) {
  if (state.busy || state.status !== "answering") return;
  state.busy = true;
  state.selected = option;

  const question = state.questions[state.index];
  const isCorrect = option === question.correct_answer;

  // Visually mark the buttons right away.
  document.querySelectorAll(".option-btn").forEach((btn) => {
    const isThis = btn.dataset.option === option;
    const isAnswer = btn.dataset.option === question.correct_answer;
    btn.disabled = true;
    if (isAnswer && (isThis || !isCorrect)) btn.classList.add("correct");
    else if (isThis && !isCorrect) btn.classList.add("wrong");
    else btn.classList.add("dim");
  });

  if (isCorrect) {
    state.status = "correct";
    playSound("correct");
    await awardXp();

    setTimeout(async () => {
      const isLast = state.index === state.questions.length - 1;
      if (isLast) {
        playSound("complete");
        await markLevelComplete();
        window.location.href =
          `level-complete.html?levelId=${encodeURIComponent(state.level.id)}` +
          `&categoryId=${encodeURIComponent(state.level.category_id)}` +
          `&xp=${state.xpEarned}&hearts=${state.hearts}`;
      } else {
        state.index += 1;
        state.selected = null;
        state.status = "answering";
        state.busy = false;
        renderQuestion();
      }
    }, 700);
  } else {
    state.status = "wrong";
    playSound("wrong");
    renderHearts(true);
    const remaining = await loseHeart();

    setTimeout(() => {
      if (remaining <= 0) {
        window.location.href = `level-failed.html?categoryId=${encodeURIComponent(state.level.category_id)}`;
      } else {
        state.selected = null;
        state.status = "answering";
        state.busy = false;
        renderQuestion(); // same question again
      }
    }, 900);
  }
}

init();
