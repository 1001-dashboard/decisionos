-- Decision OS v2.12: contesto personale («Cosa sa Decision OS di me»). Idempotente.
-- Include le colonne delle versioni precedenti, per chi non le avesse ancora.
alter table public.outcomes add column if not exists chosen_id text;
alter table public.outcomes add column if not exists pred jsonb;
alter table public.outcomes add column if not exists act jsonb;
alter table public.profiles add column if not exists vault jsonb not null default '[]';
