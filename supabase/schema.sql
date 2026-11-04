create table public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.coaching_sessions (
  id bigint generated always as identity primary key,
  session_date date not null,
  client text not null,
  client_type text not null default '新客户' check (client_type in ('新客户', '复访客户')),
  is_paid boolean not null default false,
  price numeric(10,2) not null default 0 check (price >= 0),
  rating smallint not null default 0 check (rating between 0 and 5),
  topic text not null,
  duration numeric(5,2) not null check (duration > 0),
  created_at timestamptz not null default now()
);

create index coaching_sessions_date_idx
  on public.coaching_sessions (session_date desc);
