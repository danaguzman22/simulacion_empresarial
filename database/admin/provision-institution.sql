-- OPERATOR-ONLY psql procedure, NOT a migration and NOT called by the app.
-- Run only after explicitly verifying the real organization and administrator.
-- Required psql variables: institution_name, institution_type, admin_profile_id.
-- No connection string, credentials or identity is embedded here.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Validate in PostgreSQL, aborting the transaction before either INSERT.
SELECT set_config('nexus.provision_admin_profile_id', :'admin_profile_id', true);
DO $$
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id = current_setting('nexus.provision_admin_profile_id')::uuid
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_profile_id % does not exist in public.profiles',
      current_setting('nexus.provision_admin_profile_id')
      USING ERRCODE = '23503';
  END IF;
END $$;
SELECT id AS verified_admin FROM public.profiles WHERE id=:'admin_profile_id'::uuid \gset
INSERT INTO public.institutions(name,type)
VALUES (:'institution_name', :'institution_type'::public.institution_type)
RETURNING id AS new_institution_id \gset
INSERT INTO public.institution_members(institution_id,profile_id,role,granted_by)
VALUES (:'new_institution_id'::uuid,:'verified_admin'::uuid,'admin',:'verified_admin'::uuid);
COMMIT;
SELECT :'new_institution_id' AS institution_id;
