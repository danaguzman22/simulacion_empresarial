-- OPERATOR-ONLY psql procedure, NOT a migration and NOT called by the app.
-- Run only after explicitly verifying the real organization and administrator.
-- Since 0034 (#6) a new institution is born only from an approved registration with its complete data. This does the
-- same as "Crear institución" in the NEXUS administration panel (registration + approval in one transaction,
-- recorded as created by the NEXUS admin). Prefer the panel; use this only when the panel cannot be used.
-- Required psql variables:
--   nexus_admin_profile_id  an active NEXUS admin (recorded as the creator)
--   admin_email             e-mail of the registered account that becomes the main admin of the institution
--   data_file               path to a JSON file with the registration data, in the app's format, for example:
--     {"legalName":"Universidad Ejemplo","displayName":"UE","kind":"educational","educationLevel":"university",
--      "organizationKind":"direct","country":"AR","taxId":"30123456789","website":"https://ejemplo.edu.ar",
--      "province":"Córdoba","locality":"Córdoba","postalCode":"5000","address":"Calle 123",
--      "institutionalEmail":"info@ejemplo.edu.ar","institutionalPhone":"351 400 0000",
--      "responsiblePosition":"Rector/a","responsibleArea":"Rectorado","responsiblePhone":null,
--      "alternate":{"name":"Nombre","position":"Cargo","email":"otro@ejemplo.edu.ar","phone":null},"message":""}
--   The database validates every rule again (CUIT, uniqueness, province, contacts, lengths, no HTML).
-- No connection string, credentials or identity is embedded here.
--   psql "<connection>" -v nexus_admin_profile_id=UUID -v admin_email='persona@ejemplo.com' -v data_file=registro.json -f database/admin/provision-institution.sql
\set ON_ERROR_STOP on
\set registration_data `cat :data_file`
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexus.provision_nexus_admin_profile_id', :'nexus_admin_profile_id', true);
SELECT set_config('nexus.provision_admin_email', :'admin_email', true);
DO $$
DECLARE matches integer;
BEGIN
  IF NOT public.is_nexus_admin(current_setting('nexus.provision_nexus_admin_profile_id')::uuid) THEN
    RAISE EXCEPTION 'nexus_admin_profile_id % is not an active NEXUS admin', current_setting('nexus.provision_nexus_admin_profile_id');
  END IF;
  SELECT count(*) INTO matches FROM public.find_registered_profile_by_email(current_setting('nexus.provision_admin_email'));
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one registered account with that e-mail, found %', matches USING ERRCODE = '23503';
  END IF;
END $$;
SELECT profile_id AS admin_profile_id FROM public.find_registered_profile_by_email(:'admin_email') \gset
SELECT public.nexus_create_institution(:'nexus_admin_profile_id'::uuid, :'admin_profile_id'::uuid, lower(:'admin_email'), :'registration_data'::jsonb) AS new_institution_id \gset
COMMIT;
SELECT :'new_institution_id' AS institution_id;
