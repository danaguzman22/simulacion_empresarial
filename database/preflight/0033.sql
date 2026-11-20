-- Read-only preflight for 0033_section_requirements (#71, D-33). Run before applying; it changes nothing.
-- 1. The new columns and functions must not exist yet.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'games' AND column_name IN ('goals_required', 'rules_required');
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('guard_game_section_requirements', 'check_game_section_requirements_audited', 'check_start_section_requirements');
-- 2. Every existing audit operation must still fit the widened CHECK (no unexpected values).
SELECT operation, count(*) FROM public.game_preparation_changes GROUP BY operation ORDER BY operation;
-- 3. Games by status: draft/ready ones will get goals_required = false (option b); the rest keep the defaults.
SELECT status, count(*) AS games,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.game_goals g WHERE g.game_id = games.id)) AS without_goals,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.game_rules r WHERE r.game_id = games.id AND r.enabled)) AS with_enabled_rules
FROM public.games GROUP BY status ORDER BY status;
-- 4. Exactly the games the UPDATE will touch.
SELECT id, campaign_id, sequence, name, status,
       (SELECT count(*) FROM public.game_goals g WHERE g.game_id = games.id) AS goals
FROM public.games WHERE status IN ('draft', 'ready') ORDER BY campaign_id, sequence;
-- 5. Expected 0: a game in preparation with started_at set would be locked by the new guard.
SELECT count(*) AS games_starting_now FROM public.games WHERE status IN ('draft', 'ready') AND started_at IS NOT NULL;
