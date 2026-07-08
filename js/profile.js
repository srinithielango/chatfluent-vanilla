// Loads the signed-in user's profile row, creating it on first login
// (belt-and-suspenders alongside the DB trigger in scripts/schema.sql),
// then applies the daily streak and 24h heart-refill rules and writes
// any changes back to Supabase so it stays the source of truth.
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

// Call at the top of every protected page. Redirects to the landing
// page if there's no session, otherwise returns { user, profile }.
async function requireAuthAndProfile() {
  const {
    data: { session },
  } = await db.auth.getSession();

  if (!session) {
    window.location.href = "index.html";
    return null;
  }

  const profile = await loadProfile(session.user);
  return { user: session.user, profile: profile };
}

// Call this from a logout button anywhere in the app.
async function signOut() {
  await db.auth.signOut();
  window.location.href = "index.html";
}