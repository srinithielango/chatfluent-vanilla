// Daily login streak math. Compares calendar days, not timestamps,
// so an 11pm login and a 7am login the next day still count as
// consecutive days.

function toDateOnly(dateLike) {
  const d = new Date(dateLike);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(a, b) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((toDateOnly(b) - toDateOnly(a)) / MS_PER_DAY);
}

/**
 * lastLoginDate: string like "2026-07-08" or null
 * currentStreak: number
 * today: Date (defaults to now)
 * Returns { streak, shouldUpdate }
 *
 * - No previous login       -> start streak at 1
 * - Same calendar day       -> no change
 * - Exactly 1 day later     -> streak + 1
 * - More than 1 day later   -> streak resets to 1
 */
function computeNextStreak(lastLoginDate, currentStreak, today) {
  today = today || new Date();

  if (!lastLoginDate) {
    return { streak: 1, shouldUpdate: true };
  }

  const diff = daysBetween(lastLoginDate, today);

  if (diff === 0) {
    return { streak: currentStreak, shouldUpdate: false };
  }
  if (diff === 1) {
    return { streak: currentStreak + 1, shouldUpdate: true };
  }
  return { streak: 1, shouldUpdate: true };
}

function formatDateOnly(date) {
  return toDateOnly(date || new Date()).toISOString().slice(0, 10);
}
