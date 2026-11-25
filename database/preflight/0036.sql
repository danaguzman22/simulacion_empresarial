-- Read-only preflight for 0036_assignment_candidates. It changes nothing.
-- 0036 ADDS the read-only function game_assignment_candidates and REPLACES guard_game_card_assignment (D-48).
-- No table, column or row changes.
-- 1. Expected empty: the function does not exist yet.
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'game_assignment_candidates';
-- 2. What it reads must exist (expected: 6 rows) and the roles of the grants (expected: anon, authenticated, service_role).
SELECT table_schema || '.' || table_name AS needed FROM information_schema.tables
WHERE (table_schema, table_name) IN (('public','games'),('public','campaigns'),('public','companies'),('public','institution_members'),('public','profiles'),('public','game_card_assignments'))
ORDER BY 1;
SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname;
-- 3. D-48: 0036 replaces guard_game_card_assignment. Expected: exactly 1 trigger uses it (game_card_assignments_guard)
--    and its current body is the one of 0029 (compare md5 with the local database, where 0029 is the last version).
SELECT tgname FROM pg_trigger WHERE tgfoid = 'public.guard_game_card_assignment()'::regprocedure AND NOT tgisinternal;
SELECT md5(prosrc) AS guard_md5 FROM pg_proc WHERE oid = 'public.guard_game_card_assignment()'::regprocedure;
-- 4. Informative: members who today have a role in the campaign of their game. 0036 does NOT touch them (new
--    additions are refused; existing rows stay until the Master removes them in Equipos).
SELECT g.name AS game, g.status::text AS status, cm.role::text AS campaign_role, count(*) AS members
FROM public.game_card_assignments a
JOIN public.games g ON g.id = a.game_id
JOIN public.campaign_members cm ON cm.campaign_id = g.campaign_id AND cm.profile_id = a.profile_id
GROUP BY g.name, g.status, cm.role ORDER BY 1;
