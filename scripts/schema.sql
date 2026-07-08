-- ChatFluent database schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

-- profiles table (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  avatar_url text,
  hearts int default 3,
  last_heart_lost_at timestamptz,
  streak int default 0,
  last_login_date date,
  xp int default 0,
  created_at timestamptz default now()
);

-- categories table
create table if not exists categories (
  id text primary key, -- e.g. 'greetings'
  name text not null,
  icon text,
  sort_order int default 0
);

-- levels table
create table if not exists levels (
  id text primary key, -- e.g. 'greetings-1'
  category_id text references categories(id) on delete cascade,
  level_number int not null,
  title text
);

-- questions table
create table if not exists questions (
  id uuid default gen_random_uuid() primary key,
  level_id text references levels(id) on delete cascade,
  question_text text not null,
  options jsonb not null, -- array of 3 strings
  correct_answer text not null,
  sort_order int default 0
);

-- user_progress table (tracks completed levels per user)
create table if not exists user_progress (
  user_id uuid references profiles(id) on delete cascade,
  level_id text references levels(id) on delete cascade,
  completed boolean default false,
  completed_at timestamptz,
  primary key (user_id, level_id)
);

-- Enable RLS
alter table profiles enable row level security;
alter table user_progress enable row level security;
alter table categories enable row level security;
alter table levels enable row level security;
alter table questions enable row level security;

-- profiles: a user can only see/edit their own row
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- user_progress: a user can only see/edit their own rows
drop policy if exists "Users can view own progress" on user_progress;
create policy "Users can view own progress" on user_progress
  for select using (auth.uid() = user_id);

drop policy if exists "Users can upsert own progress" on user_progress;
create policy "Users can upsert own progress" on user_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on user_progress;
create policy "Users can update own progress" on user_progress
  for update using (auth.uid() = user_id);

-- categories/levels/questions are public read-only
drop policy if exists "Public read categories" on categories;
create policy "Public read categories" on categories for select using (true);

drop policy if exists "Public read levels" on levels;
create policy "Public read levels" on levels for select using (true);

drop policy if exists "Public read questions" on questions;
create policy "Public read questions" on questions for select using (true);

-- Seed the four categories used by the app
insert into categories (id, name, icon, sort_order) values
  ('greetings', 'Greetings', '👋', 1),
  ('shopping', 'Shopping', '🛍️', 2),
  ('travel', 'Travel', '✈️', 3),
  ('daily-conversation', 'Daily Conversation', '💬', 4)
on conflict (id) do nothing;

-- Auto-create a profile row whenever a new auth user is created
-- (covers Google OAuth sign-ins). Belt-and-suspenders alongside the
-- client-side upsert in lib/supabase, in case that ever races.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
