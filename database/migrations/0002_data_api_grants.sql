-- Custom SQL migration file, put your code below! ---- =========================================================
-- SIMULACIÓN EMPRESARIAL / NEXUS
-- Data API grants
-- =========================================================

-- Permitimos utilizar el schema.
GRANT USAGE
ON SCHEMA public
TO authenticated, service_role;


-- ---------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE public.profiles
TO authenticated, service_role;


-- ---------------------------------------------------------
-- COMPANIES
-- ---------------------------------------------------------

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE public.companies
TO authenticated, service_role;


-- ---------------------------------------------------------
-- CAMPAIGNS
-- ---------------------------------------------------------

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE public.campaigns
TO authenticated, service_role;


-- ---------------------------------------------------------
-- CAMPAIGN MEMBERS
-- ---------------------------------------------------------

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE public.campaign_members
TO authenticated, service_role;