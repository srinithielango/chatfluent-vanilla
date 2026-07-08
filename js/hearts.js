const MAX_HEARTS = 3;
const HEART_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * hearts: number
 * lastHeartLostAt: ISO timestamp string or null
 * now: Date (defaults to now)
 * Returns { hearts, needsRefillCommit, msRemaining }
 */
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
