function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

let countdownInterval = null;

async function init() {
  const result = await requireAuthAndProfile();
  if (!result) return;

  const categoryId = getQueryParam("categoryId") || "";

  const { data: profile } = await db
    .from("profiles")
    .select("hearts, last_heart_lost_at")
    .eq("id", result.user.id)
    .single();

  const heartsState = getHeartsState(profile ? profile.hearts : 0, profile ? profile.last_heart_lost_at : null);

  render(heartsState, categoryId);
}

function render(heartsState, categoryId) {
  const readyBlock = `<div class="num" style="color: var(--mint-600); font-size:1.5rem;">Ready!</div>`;
  const countdownBlock = `
    <p style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color: rgba(28,37,33,0.4); margin-bottom:4px;">Come back in</p>
    <div class="countdown" id="countdown">${formatCountdown(heartsState.msRemaining)}</div>
  `;

  document.getElementById("app").innerHTML = `
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
            ? `<a class="btn btn-primary btn-block" href="category.html?id=${encodeURIComponent(categoryId)}">Keep practicing</a>`
            : ""
        }
        <a class="btn btn-outline btn-block" href="dashboard.html">Back to dashboard</a>
      </div>
    </div>
  `;

  if (heartsState.hearts <= 0) {
    let msRemaining = heartsState.msRemaining;
    countdownInterval = setInterval(() => {
      msRemaining -= 1000;
      const el = document.getElementById("countdown");
      if (msRemaining <= 0) {
        clearInterval(countdownInterval);
        window.location.reload(); // hearts have refilled server-side by now
        return;
      }
      if (el) el.textContent = formatCountdown(msRemaining);
    }, 1000);
  }
}

init();
