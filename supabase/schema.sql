-- Decision OS - schema Supabase. Eseguire una volta in SQL Editor.
-- Tutti i dati sono privati: RLS su ogni tabella, accesso solo al proprietario.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  resources jsonb not null default '{"cash0":0,"cash_m":0,"hours_w":40}',
  resources_meta jsonb not null default '{}',   -- {cash0:{dt,src}}
  rules jsonb not null default '[]',
  priorities jsonb not null default '{"stabilita":3,"crescita":3,"indipendenza":3,"benessere":3}',
  context jsonb not null default '{}',          -- economia, lavoro, famiglia, tempo, residenza, progetti
  ai_share jsonb not null default '{"economia":false,"contesto":false}',
  horizon int not null default 24,
  updated_at timestamptz not null default now()
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  descr text,
  status text not null default 'aperta' check (status in ('aperta','presa','archiviata')),
  imp int not null default 1 check (imp between 1 and 3),
  due date,
  model jsonb not null default '{"criteria":[],"constraints":[],"options":[],"assumptions":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  rule jsonb not null,                -- {if, excl|req|and, impacts, why}
  confirmed boolean not null default false,
  source text not null default 'utente' check (source in ('utente','ai')),
  created_at timestamptz not null default now()
);

-- Risultati congelati: mai sovrascritti.
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  label text not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  decision_id uuid references public.decisions on delete set null,
  decision_name text not null,
  chosen text not null,
  chosen_id text,
  decided_at date not null default current_date,
  expected text,
  review_at date,
  observed text,
  cause text check (cause in ('ragionamento','dato','imprevisto','nessuno')),
  snapshot_id uuid references public.snapshots on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.decisions enable row level security;
alter table public.dependencies enable row level security;
alter table public.snapshots enable row level security;
alter table public.outcomes enable row level security;

drop policy if exists own on public.profiles;
create policy own on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists own on public.decisions;
create policy own on public.decisions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own on public.dependencies;
create policy own on public.dependencies for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_read on public.snapshots;
create policy own_read on public.snapshots for select using (user_id = auth.uid());
drop policy if exists own_ins on public.snapshots;
create policy own_ins on public.snapshots for insert with check (user_id = auth.uid());
drop policy if exists own_del on public.snapshots;
create policy own_del on public.snapshots for delete using (user_id = auth.uid());
drop policy if exists own on public.outcomes;
create policy own on public.outcomes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists decisions_user on public.decisions(user_id);
create index if not exists deps_user on public.dependencies(user_id);
create index if not exists snaps_user on public.snapshots(user_id, created_at desc);
create index if not exists outcomes_user on public.outcomes(user_id);

-- Uso AI: contatore per limitare la spesa (vedi /api/ai).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null default current_date,
  calls int not null default 0,
  tokens int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists own on public.ai_usage;
create policy own on public.ai_usage for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- v2.8: identità della strada scelta (l'id, non il nome). Idempotente: si può rilanciare.
alter table public.outcomes add column if not exists chosen_id text;
