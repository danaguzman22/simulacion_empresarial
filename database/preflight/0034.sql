-- Read-only preflight for 0034_nexus_admin (#6, D-16, D-17, D-18, D-41 to D-43). Run before applying; it changes nothing.
-- 0034 only ADDS: two values of institution_type, four new tables (registrations, contacts, NEXUS admins and their
-- actions), new nullable columns in institutions and functions/triggers. No existing row is updated or deleted.
-- From now on every NEW institution must come from an approved registration with its complete data (deferred
-- trigger); existing institutions are not affected (their new columns stay null).
-- 1. Expected empty: none of the new objects may exist yet.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('institution_registrations', 'institution_contacts', 'nexus_admins', 'nexus_admin_actions');
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'institutions'
  AND column_name IN ('legal_name', 'display_name', 'locality', 'education_level', 'sector', 'company_size', 'organization_kind', 'tax_id', 'website',
                      'country', 'province', 'postal_code', 'address');
SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'institution_registration_status';
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.institution_type'::regtype ORDER BY enumsortorder;  -- expected: educational, company, other
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_nexus_admin', 'guard_nexus_admins', 'normalize_institution_text', 'valid_cuit', 'guard_institution_registrations',
                  'check_registration_contacts', 'guard_institution_contacts', 'check_institution_from_registration', 'audit_nexus_admins',
                  'audit_institution_registrations', 'reject_nexus_admin_history_change', 'insert_institution_registration', 'register_institution',
                  'approve_institution_registration', 'reject_institution_registration', 'nexus_create_institution', 'nexus_add_institution_admin',
                  'grant_nexus_admin', 'revoke_nexus_admin');
-- 2. Existing institutions: they stay exactly as they are (new columns null). Count and list them.
SELECT count(*) AS institutions FROM public.institutions;
SELECT id, name, type, created_at FROM public.institutions ORDER BY name, id;
-- 3. Each existing institution keeps at least one active admin (nothing here changes that; for reference).
SELECT i.name, count(m.id) FILTER (WHERE m.role = 'admin' AND m.status = 'active') AS active_admins
FROM public.institutions i LEFT JOIN public.institution_members m ON m.institution_id = i.id
GROUP BY i.id, i.name ORDER BY i.name;
-- 4. The roles the grants refer to must exist (expected: anon, authenticated, service_role).
SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname;
-- 5. The function used to find accounts by e-mail (0029) must exist; NEXUS admins and "Crear institución" use it.
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'find_registered_profile_by_email';
