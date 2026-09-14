create table public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.coaching_sessions (
  id bigint generated always as identity primary key,
  session_date date not null,
  client text not null,
  topic text not null,
  duration numeric(5,2) not null check (duration > 0),
  created_at timestamptz not null default now()
);

create index coaching_sessions_date_idx
  on public.coaching_sessions (session_date desc);
