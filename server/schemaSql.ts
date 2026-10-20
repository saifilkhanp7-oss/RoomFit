// Same SQL as server/schema.sql (a test checks they match).
export const SCHEMA_SQL = `-- RoomFit database schema (Supabase / Postgres).
-- The backend also runs this automatically on first use, so pasting it into the
-- Supabase SQL Editor is optional. Safe to run more than once.

create sequence if not exists rf_rev;

create table if not exists rf_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- name as the user typed it
  name_key text not null unique,         -- lower-case form, so "Saif" and "saif" are the same name
  password_hash text not null,
  recovery_hash text not null,           -- one-time recovery code (only the hash is stored)
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists rf_sessions (
  token_hash text primary key,           -- sha256 of the device token (the token itself is never stored)
  user_id uuid not null references rf_users(id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists rf_sessions_user on rf_sessions(user_id);

create table if not exists rf_homes (
  user_id uuid not null references rf_users(id) on delete cascade,
  id text not null,
  data jsonb,                            -- the whole home (rooms, layouts, furniture) as JSON
  deleted boolean not null default false,
  updated_at bigint not null,            -- when the user last changed it (ms)
  rev bigint not null default nextval('rf_rev'),
  primary key (user_id, id)
);
create index if not exists rf_homes_rev on rf_homes(user_id, rev);

create table if not exists rf_user_state (
  user_id uuid primary key references rf_users(id) on delete cascade,
  templates jsonb not null default '[]'::jsonb,   -- "My items"
  updated_at bigint not null default 0,
  rev bigint not null default nextval('rf_rev')
);

-- Lock the tables against Supabase's public API. Only our backend (which connects
-- with the database password) can read or write them.
alter table rf_users enable row level security;
alter table rf_sessions enable row level security;
alter table rf_homes enable row level security;
alter table rf_user_state enable row level security;
`;
