-- Read-only preflight for 0036_assignment_candidates. It changes nothing.
-- 0036 only ADDS the read-only function game_assignment_candidates (no table, column or row changes).
-- 1. Expected empty: the function does not exist yet.
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'game_assignment_candidates';
-- 2. What it reads must exist (expected: 6 rows) and the roles of the grants (expected: anon, authenticated, service_role).
SELECT table_schema || '.' || table_name AS needed FROM information_schema.tables
WHERE (table_schema, table_name) IN (('public','games'),('public','campaigns'),('public','companies'),('public','institution_members'),('public','profiles'),('public','game_card_assignments'))
ORDER BY 1;
SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname;
