-- OPERATOR-ONLY psql procedure, NOT a migration and NOT called by the app (#6, D-17).
-- Creates the FIRST NEXUS admin. It only works while there is no active NEXUS admin: after that, the role is given
-- only from the NEXUS administration panel by another admin (the database rejects anything else).
-- Run only after 0034 is applied and after verifying that the account belongs to the right person.
-- Required psql variable: admin_email (the account must already be registered in NEXUS).
-- No connection string, credentials or identity is embedded here.
--   psql "<connection>" -v admin_email='persona@ejemplo.com' -f database/admin/grant-first-nexus-admin.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexus.first_admin_email', :'admin_email', true);
DO $$
DECLARE matches integer;
BEGIN
  SELECT count(*) INTO matches FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(current_setting('nexus.first_admin_email'));
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one registered account with that e-mail, found %', matches USING ERRCODE = '23503';
  END IF;
  IF EXISTS(SELECT 1 FROM public.nexus_admins WHERE revoked_at IS NULL) THEN
    RAISE EXCEPTION 'There is already an active NEXUS admin: new admins are named from the administration panel';
  END IF;
END $$;
-- granted_by stays null: the database accepts it only for the first admin, and records it as "first" in nexus_admin_actions.
INSERT INTO public.nexus_admins(profile_id)
SELECT p.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower(current_setting('nexus.first_admin_email'))
RETURNING profile_id AS first_nexus_admin;
SELECT action, actor_id, target_profile_id, details, created_at FROM public.nexus_admin_actions ORDER BY created_at DESC LIMIT 1;
COMMIT;
