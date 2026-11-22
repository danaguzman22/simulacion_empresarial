-- OPERATOR-ONLY psql procedure, NOT a migration and NOT called by the app.
-- Run only after explicitly verifying the real organization and administrator.
-- Since 0034 (#6) a new institution is born only from an approved registration, so this procedure does the same as
-- the NEXUS administration panel: the future admin "registers" it and an active NEXUS admin approves it. Prefer
-- the panel; use this only when the panel cannot be used.
-- Required psql variables: institution_name, institution_type, institution_locality, admin_profile_id (becomes the
-- institution admin), nexus_admin_profile_id (an active NEXUS admin, recorded as the approver).
-- No connection string, credentials or identity is embedded here.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexus.provision_admin_profile_id', :'admin_profile_id', true);
SELECT set_config('nexus.provision_nexus_admin_profile_id', :'nexus_admin_profile_id', true);
DO $$
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = current_setting('nexus.provision_admin_profile_id')::uuid FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_profile_id % does not exist in public.profiles', current_setting('nexus.provision_admin_profile_id') USING ERRCODE = '23503';
  END IF;
  IF NOT public.is_nexus_admin(current_setting('nexus.provision_nexus_admin_profile_id')::uuid) THEN
    RAISE EXCEPTION 'nexus_admin_profile_id % is not an active NEXUS admin', current_setting('nexus.provision_nexus_admin_profile_id');
  END IF;
END $$;
SELECT public.register_institution(:'admin_profile_id'::uuid, :'institution_name', :'institution_type'::public.institution_type, :'institution_locality', '') AS registration_id \gset
SELECT public.approve_institution_registration(:'nexus_admin_profile_id'::uuid, :'registration_id'::uuid) AS new_institution_id \gset
COMMIT;
SELECT :'new_institution_id' AS institution_id;
