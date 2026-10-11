-- Decision OS v2.8 — da eseguire una volta in Supabase (SQL Editor). Idempotente.
-- La strada scelta si identifica con il suo id; il nome resta per le persone.
alter table public.outcomes add column if not exists chosen_id text;
