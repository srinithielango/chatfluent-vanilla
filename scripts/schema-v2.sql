-- ============================================================
-- ChatFluent v2 — Additive schema for the new AI-powered features
-- ============================================================
-- SAFE TO RUN: this only ADDS new tables/columns. It does not drop
-- or rename anything from your existing schema.sql (profiles,
-- categories, levels, questions, user_progress all stay exactly
-- as they are and keep working).
--
-- Run this in Supabase → SQL Editor → New query → Run, AFTER your
-- original scripts/schema.sql has already been run once.
-- ============================================================


-- ----------------------------------------------------------
-- 1. Extend profiles with coins (XP → Coins economy, Feature 11)
-- ----------------------------------------------------------
alter table profiles add column if not exists coins int default 0;


-- ----------------------------------------------------------
-- 2. XP Levels (Feature 4 — Beginner → Fluent Master)
-- Reference table, public read-only. current level = highest
-- row where min_xp <= profiles.xp (computed in JS, not stored,
-- so it's always correct even if xp changes).
-- ----------------------------------------------------------
create table if not exists xp_levels (
  id serial primary key,
  level_name text not null,
  min_xp int not null,
  icon text,
  sort_order int not null
);

alter table xp_levels enable row level security;
drop policy if exists "Public read xp_levels" on xp_levels;
create policy "Public read xp_levels" on xp_levels for select using (true);

insert into xp_levels (level_name, min_xp, icon, sort_order) values
  ('Beginner', 0, '🌱', 1),
  ('Explorer', 150, '🧭', 2),
  ('Communicator', 400, '💬', 3),
  ('Speaker', 800, '🎤', 4),
  ('Advanced', 1500, '🚀', 5),
  ('Fluent Master', 2500, '👑', 6)
on conflict do nothing;


-- ----------------------------------------------------------
-- 3. XP Log (transaction history, powers the XP animation +
-- "how did I earn this" trail. profiles.xp stays the running
-- total — this table is additive detail, not the source of truth
-- for the total, so nothing existing breaks.)
-- ----------------------------------------------------------
create table if not exists xp_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  amount int not null,
  reason text not null, -- e.g. 'lesson_complete', 'conversation_complete', 'interview_complete', 'challenge_correct', 'challenge_wrong'
  created_at timestamptz default now()
);

alter table xp_log enable row level security;
drop policy if exists "Users can view own xp_log" on xp_log;
create policy "Users can view own xp_log" on xp_log for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own xp_log" on xp_log;
create policy "Users can insert own xp_log" on xp_log for insert with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- [REMOVED] AI Conversation Practice table — this feature was
-- dropped from scope. If you want it back later, this is where
-- conversation_history would go.
-- ----------------------------------------------------------


-- ----------------------------------------------------------
-- 5. Tamil → English Challenge (Feature 2)
-- Separate from the existing `levels` table on purpose, so the
-- original chat-reply game keeps working untouched.
-- ----------------------------------------------------------
create table if not exists challenge_levels (
  id text primary key, -- e.g. 'challenge-1'
  level_number int not null unique,
  title text
);

create table if not exists challenge_questions (
  id uuid default gen_random_uuid() primary key,
  challenge_level_id text references challenge_levels(id) on delete cascade,
  tamil_sentence text not null,
  correct_answer_en text not null,
  sort_order int default 0
);

create table if not exists challenge_progress (
  user_id uuid references profiles(id) on delete cascade,
  challenge_level_id text references challenge_levels(id) on delete cascade,
  completed boolean default false,
  score int default 0, -- out of 6 questions
  completed_at timestamptz,
  primary key (user_id, challenge_level_id)
);

-- per-question attempt log, so "Grammar Explanation / Vocabulary
-- Explanation" shown after each answer can be reviewed later too
create table if not exists challenge_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  challenge_question_id uuid references challenge_questions(id) on delete cascade,
  student_answer text not null,
  is_correct boolean not null,
  correct_sentence text,
  grammar_explanation text,
  vocabulary_explanation text,
  marks int default 0,
  created_at timestamptz default now()
);

alter table challenge_levels enable row level security;
alter table challenge_questions enable row level security;
alter table challenge_progress enable row level security;
alter table challenge_attempts enable row level security;

drop policy if exists "Public read challenge_levels" on challenge_levels;
create policy "Public read challenge_levels" on challenge_levels for select using (true);
drop policy if exists "Public read challenge_questions" on challenge_questions;
create policy "Public read challenge_questions" on challenge_questions for select using (true);

drop policy if exists "Users can view own challenge_progress" on challenge_progress;
create policy "Users can view own challenge_progress" on challenge_progress for select using (auth.uid() = user_id);
drop policy if exists "Users can upsert own challenge_progress" on challenge_progress;
create policy "Users can upsert own challenge_progress" on challenge_progress for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own challenge_progress" on challenge_progress;
create policy "Users can update own challenge_progress" on challenge_progress for update using (auth.uid() = user_id);

drop policy if exists "Users can view own challenge_attempts" on challenge_attempts;
create policy "Users can view own challenge_attempts" on challenge_attempts for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own challenge_attempts" on challenge_attempts;
create policy "Users can insert own challenge_attempts" on challenge_attempts for insert with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- [REMOVED] Vocabulary Notebook table — this feature was
-- dropped from scope.
-- ----------------------------------------------------------


-- ----------------------------------------------------------
-- 7. Interview Mode (Feature 12)
-- ----------------------------------------------------------
create table if not exists interview_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  questions jsonb not null,       -- array of question strings asked
  answers jsonb not null,         -- array of student answer strings
  duration_seconds int,
  grammar_score int,
  vocabulary_score int,
  confidence_score int,
  communication_score int,
  overall_rating int,
  suggestions text,
  created_at timestamptz default now()
);

alter table interview_history enable row level security;
drop policy if exists "Users can view own interviews" on interview_history;
create policy "Users can view own interviews" on interview_history for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own interviews" on interview_history;
create policy "Users can insert own interviews" on interview_history for insert with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 8. Weekly Study Planner (Feature 8)
-- ----------------------------------------------------------
create table if not exists planner (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  week_start_date date not null,
  goals jsonb not null default '[]',    -- [{ "label": "Complete Level 5", "target": 1 }, ...]
  progress jsonb not null default '[]', -- [{ "label": "Complete Level 5", "current": 0 }, ...]
  created_at timestamptz default now(),
  unique (user_id, week_start_date)
);

alter table planner enable row level security;
drop policy if exists "Users can view own planner" on planner;
create policy "Users can view own planner" on planner for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own planner" on planner;
create policy "Users can insert own planner" on planner for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own planner" on planner;
create policy "Users can update own planner" on planner for update using (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 9. Achievements / Badges (Feature 10)
-- ----------------------------------------------------------
create table if not exists badges (
  id text primary key, -- e.g. 'first_conversation'
  name text not null,
  description text,
  icon text,
  sort_order int default 0
);

create table if not exists user_badges (
  user_id uuid references profiles(id) on delete cascade,
  badge_id text references badges(id) on delete cascade,
  earned_at timestamptz default now(),
  primary key (user_id, badge_id)
);

alter table badges enable row level security;
alter table user_badges enable row level security;

drop policy if exists "Public read badges" on badges;
create policy "Public read badges" on badges for select using (true);

drop policy if exists "Users can view own badges" on user_badges;
create policy "Users can view own badges" on user_badges for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own badges" on user_badges;
create policy "Users can insert own badges" on user_badges for insert with check (auth.uid() = user_id);

insert into badges (id, name, description, icon, sort_order) values
  ('first_conversation', 'First Words', 'Complete your first AI conversation', '💬', 1),
  ('xp_100', '100 XP Club', 'Earn 100 total XP', '⭐', 2),
  ('xp_500', '500 XP Club', 'Earn 500 total XP', '🌟', 3),
  ('xp_1000', '1000 XP Club', 'Earn 1000 total XP', '✨', 4),
  ('streak_7', '7 Day Streak', 'Log in 7 days in a row', '🔥', 5),
  ('streak_30', '30 Day Streak', 'Log in 30 days in a row', '🔥', 6),
  ('first_interview', 'First Interview', 'Complete your first mock interview', '🎤', 7),
  ('level_completed', 'Level Cleared', 'Complete your first challenge level', '🏁', 8)
on conflict do nothing;


-- ----------------------------------------------------------
-- 10. Coins ledger (Feature 11)
-- profiles.coins is the running balance; this table is the
-- transaction history behind it.
-- ----------------------------------------------------------
create table if not exists coin_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  amount int not null, -- positive = earned, negative = spent
  reason text not null, -- e.g. 'xp_conversion', 'unlock_theme'
  created_at timestamptz default now()
);

alter table coin_transactions enable row level security;
drop policy if exists "Users can view own coin_transactions" on coin_transactions;
create policy "Users can view own coin_transactions" on coin_transactions for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own coin_transactions" on coin_transactions;
create policy "Users can insert own coin_transactions" on coin_transactions for insert with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 11. Analytics (Feature 7) — one row per user per day.
-- Charts (weekly/monthly progress, conversation count,
-- challenge accuracy, vocab growth) all read from this table
-- grouped by date, instead of re-scanning every history table
-- every time the dashboard loads.
-- ----------------------------------------------------------
create table if not exists analytics_daily (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  date date not null default current_date,
  xp_earned int default 0,
  conversations_count int default 0,
  challenges_correct int default 0,
  challenges_wrong int default 0,
  vocabulary_learned int default 0,
  unique (user_id, date)
);

alter table analytics_daily enable row level security;
drop policy if exists "Users can view own analytics" on analytics_daily;
create policy "Users can view own analytics" on analytics_daily for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own analytics" on analytics_daily;
create policy "Users can insert own analytics" on analytics_daily for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own analytics" on analytics_daily;
create policy "Users can update own analytics" on analytics_daily for update using (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 12. Leaderboard (Feature 6)
-- Implemented as a SECURITY DEFINER function, not a table or a
-- plain view. profiles/user_progress/challenge_progress are all
-- locked down by RLS to "your own row only" — a plain view would
-- inherit that and show each user only themselves. A function
-- marked SECURITY DEFINER intentionally runs with elevated rights
-- to compute the public ranking, but it only ever returns the
-- specific non-sensitive columns listed below (never email, never
-- auth data), so it's safe to expose to every logged-in user.
-- ----------------------------------------------------------
create or replace function get_leaderboard()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  xp int,
  streak int,
  coins int,
  lessons_completed bigint,
  challenge_levels_completed bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.full_name,
    p.avatar_url,
    p.xp,
    p.streak,
    p.coins,
    count(distinct up.level_id) filter (where up.completed) as lessons_completed,
    count(distinct cp.challenge_level_id) filter (where cp.completed) as challenge_levels_completed
  from profiles p
  left join user_progress up on up.user_id = p.id
  left join challenge_progress cp on cp.user_id = p.id
  group by p.id, p.full_name, p.avatar_url, p.xp, p.streak, p.coins
  order by p.xp desc
  limit 20;
$$;

-- Let any signed-in user call it (the function body itself decides
-- what's returned — no direct table access is granted).
grant execute on function get_leaderboard() to authenticated;


-- ============================================================
-- Done. Your existing tables (profiles, categories, levels,
-- questions, user_progress) are untouched. All new tables above
-- are additive.
-- ============================================================