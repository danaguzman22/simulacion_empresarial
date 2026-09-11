-- =========================================================
-- SIMULACIÓN EMPRESARIAL
-- Games / Rounds / Rooms security & triggers
-- =========================================================


-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------

ALTER TABLE "public"."games"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rounds"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rooms"
ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------
-- DATA API GRANTS
-- ---------------------------------------------------------

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE "public"."games"
TO authenticated, service_role;

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE "public"."rounds"
TO authenticated, service_role;

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON TABLE "public"."rooms"
TO authenticated, service_role;


-- ---------------------------------------------------------
-- UPDATED_AT AUTOMÁTICO
-- La función public.set_updated_at ya fue creada
-- en una migración anterior.
-- ---------------------------------------------------------


-- games

DROP TRIGGER IF EXISTS
"games_set_updated_at"
ON "public"."games";

CREATE TRIGGER
"games_set_updated_at"
BEFORE UPDATE
ON "public"."games"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();


-- rounds

DROP TRIGGER IF EXISTS
"rounds_set_updated_at"
ON "public"."rounds";

CREATE TRIGGER
"rounds_set_updated_at"
BEFORE UPDATE
ON "public"."rounds"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();


-- rooms

DROP TRIGGER IF EXISTS
"rooms_set_updated_at"
ON "public"."rooms";

CREATE TRIGGER
"rooms_set_updated_at"
BEFORE UPDATE
ON "public"."rooms"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();