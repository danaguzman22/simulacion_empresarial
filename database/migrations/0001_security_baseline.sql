-- Custom SQL migration file, put your code below! ---- =========================================================
-- NEXUS / SIMULACIÓN EMPRESARIAL
-- Security baseline
-- =========================================================


-- ---------------------------------------------------------
-- PROFILE <-> SUPABASE AUTH USER
-- ---------------------------------------------------------

ALTER TABLE "public"."profiles"
ADD CONSTRAINT "profiles_id_auth_users_id_fk"
FOREIGN KEY ("id")
REFERENCES "auth"."users"("id")
ON DELETE CASCADE;


-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------

ALTER TABLE "public"."profiles"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."companies"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campaigns"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campaign_members"
ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------
-- CREACIÓN AUTOMÁTICA DEL PROFILE
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION
"public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

  INSERT INTO "public"."profiles" (
    "id",
    "display_name"
  )
  VALUES (
    NEW.id,

    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1),
      'Usuario'
    )
  );

  RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
"on_auth_user_created"
ON "auth"."users";


CREATE TRIGGER
"on_auth_user_created"
AFTER INSERT
ON "auth"."users"
FOR EACH ROW
EXECUTE FUNCTION
"public"."handle_new_user"();


-- ---------------------------------------------------------
-- UPDATED_AT AUTOMÁTICO
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION
"public"."set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN

  NEW.updated_at = NOW();

  RETURN NEW;

END;
$$;


-- profiles

DROP TRIGGER IF EXISTS
"profiles_set_updated_at"
ON "public"."profiles";


CREATE TRIGGER
"profiles_set_updated_at"
BEFORE UPDATE
ON "public"."profiles"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();


-- companies

DROP TRIGGER IF EXISTS
"companies_set_updated_at"
ON "public"."companies";


CREATE TRIGGER
"companies_set_updated_at"
BEFORE UPDATE
ON "public"."companies"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();


-- campaigns

DROP TRIGGER IF EXISTS
"campaigns_set_updated_at"
ON "public"."campaigns";


CREATE TRIGGER
"campaigns_set_updated_at"
BEFORE UPDATE
ON "public"."campaigns"
FOR EACH ROW
EXECUTE FUNCTION
"public"."set_updated_at"();