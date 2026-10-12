-- Decision OS v2.9: previsione salvata al momento della scelta e consuntivo, per imparare dai propri errori di stima.
-- Idempotente: si può eseguire più volte. Include anche la colonna della v2.8.
alter table public.outcomes add column if not exists chosen_id text;
alter table public.outcomes add column if not exists pred jsonb;
alter table public.outcomes add column if not exists act jsonb;
