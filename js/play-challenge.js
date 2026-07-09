function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const state = {
  user: null,
  level: null,
  questions: [],
  index: 0,
  correctCount: 0,
  busy: false,
};

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return;
  state.user = result.user;

  const levelId = getQueryParam("levelId");
  if (!levelId) {
    window.location.href = "challenge.html";
    return;
  }

  const { data: level } = await db.from("challenge_levels").select("*").eq("id", levelId).single();
  if (!level) {
    document.getElementById("app").innerHTML = "<p>Level not found.</p>";
    return;
  }
  state.level = level;

  // Enforce level unlock order.
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
        .eq("user_id", state.user.id)
        .eq("challenge_level_id", prevLevel.id)
        .single();

      if (!prevProgress || !prevProgress.completed) {
        window.location.href = "challenge.html";
        return;
      }
    }
  }

  const { data: questions } = await db
    .from("challenge_questions")
    .select("*")
    .eq("challenge_level_id", level.id)
    .order("sort_order", { ascending: true });

  state.questions = questions || [];
  renderQuestion();
}

function renderShell(bodyHtml) {
  document.getElementById("app").innerHTML = `
    <header class="play-header">
      <a class="exit-btn" href="challenge.html" aria-label="Exit level">✕</a>
      <div class="progress-bar"><div style="width:${
        state.questions.length > 0 ? Math.round((state.index / state.questions.length) * 100) : 0
      }%;"></div></div>
    </header>
    ${bodyHtml}
  `;
}

function renderQuestion() {
  const question = state.questions[state.index];

  if (!question) {
    renderShell('<p style="color: rgba(28,37,33,0.5);">No questions in this level yet.</p>');
    return;
  }

  renderShell(`
    <div class="bubble-row">
      <div class="bubble theirs" style="font-size:18px;">${escapeHtml(question.tamil_sentence)}</div>
    </div>
    <p style="font-size:13px; color: rgba(28,37,33,0.5); margin: 4px 0 16px;">Type the English translation:</p>
    <textarea id="answer-input" rows="3" placeholder="Type your answer here…"
      style="width:100%; border:2px solid var(--line); border-radius:16px; padding:12px 16px; font-family:inherit; font-size:15px; resize:none;"
    ></textarea>
    <button id="submit-btn" class="btn btn-primary btn-block" style="margin-top:16px;">Check answer</button>
  `);

  document.getElementById("submit-btn").addEventListener("click", handleSubmit);
  document.getElementById("answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleSubmit() {
  if (state.busy) return;
  const input = document.getElementById("answer-input");
  const studentAnswer = input.value.trim();
  if (!studentAnswer) {
    input.focus();
    return;
  }

  state.busy = true;
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Checking…";

  const question = state.questions[state.index];

  let result;
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
    renderShell(`
      <p style="color: var(--coral-600);">Could not check your answer right now.</p>
      <p style="font-size:13px; color: rgba(28,37,33,0.5);">${escapeHtml(err.message || "")}</p>
      <p style="font-size:13px; color: rgba(28,37,33,0.5); margin-top:8px;">
        (This feature needs the app to be deployed on Vercel with GROQ_API_KEY set —
        it won't work from Live Server on your own computer.)
      </p>
      <button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="renderQuestion()">Try again</button>
    `);
    state.busy = false;
    return;
  }

  await recordAttempt(question, studentAnswer, result);

  if (result.correct) state.correctCount += 1;

  const xpChange = result.correct ? 10 : 2;
  await awardXp(xpChange);
  playSound(result.correct ? "correct" : "wrong");

  renderShell(`
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
        ${state.index === state.questions.length - 1 ? "Finish level" : "Next question"}
      </button>
    </div>
  `);

  document.getElementById("next-btn").addEventListener("click", goToNext);
  state.busy = false;
}

async function recordAttempt(question, studentAnswer, result) {
  await db.from("challenge_attempts").insert({
    user_id: state.user.id,
    challenge_question_id: question.id,
    student_answer: studentAnswer,
    is_correct: !!result.correct,
    correct_sentence: result.correctSentence || question.correct_answer_en,
    grammar_explanation: result.grammarExplanation || null,
    vocabulary_explanation: result.vocabularyExplanation || null,
    marks: result.marks ?? (result.correct ? 10 : 0),
  });
}

async function awardXp(amount) {
  const { data } = await db.from("profiles").select("xp").eq("id", state.user.id).single();
  const currentXp = data ? data.xp : 0;
  await db.from("profiles").update({ xp: currentXp + amount }).eq("id", state.user.id);
  await db.from("xp_log").insert({
    user_id: state.user.id,
    amount,
    reason: amount >= 10 ? "challenge_correct" : "challenge_wrong",
  });
}

async function goToNext() {
  const isLast = state.index === state.questions.length - 1;

  if (isLast) {
    await db.from("challenge_progress").upsert(
      {
        user_id: state.user.id,
        challenge_level_id: state.level.id,
        completed: true,
        score: state.correctCount,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,challenge_level_id" }
    );
    playSound("complete");
    window.location.href = `challenge.html`;
  } else {
    state.index += 1;
    renderQuestion();
  }
}

init();