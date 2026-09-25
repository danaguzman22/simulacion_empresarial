-- Read-only. Existing rows must remain unassigned until an explicit review.
SELECT to_regclass('public.institutions') AS institutions,
       to_regclass('public.institution_members') AS institution_members,
       to_regclass('public.institution_access_requests') AS institution_access_requests;
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='institution_id';
SELECT c.id,c.name,c.created_by,
 (SELECT count(*) FROM public.campaigns ca WHERE ca.company_id=c.id) AS campaigns,
 (SELECT count(*) FROM public.game_card_assignments a JOIN public.campaigns ca ON ca.id=a.campaign_id WHERE ca.company_id=c.id) AS student_assignments
FROM public.companies c ORDER BY c.created_at,c.id;
SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user;
SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
-- This inventory deliberately neither infers ownership nor grants memberships.
