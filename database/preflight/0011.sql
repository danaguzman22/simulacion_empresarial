-- Read-only preflight. Existing rounds require explicit review; do not infer a plan.
SELECT id, game_id, sequence, status, duration_seconds FROM public.rounds ORDER BY game_id,sequence;
-- Already started games have no period plan. They cannot be configured retrospectively.
SELECT id, campaign_id, name, status FROM public.games WHERE status IN ('active','paused') ORDER BY campaign_id,sequence;
SELECT to_regclass('public.round_changes') AS round_changes, to_regclass('public.game_period_changes') AS game_period_changes;
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='games' AND column_name IN ('period_count','period_label','period_duration_seconds','period_revision');
