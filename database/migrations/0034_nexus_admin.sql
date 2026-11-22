CREATE TYPE "public"."institution_registration_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."institution_type" ADD VALUE 'public_agency';--> statement-breakpoint
ALTER TYPE "public"."institution_type" ADD VALUE 'ngo';--> statement-breakpoint
CREATE TABLE "institution_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"institution_id" uuid,
	"kind" text NOT NULL,
	"profile_id" uuid,
	"name" text,
	"position" text,
	"area" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_contacts_kind_valid" CHECK ("institution_contacts"."kind" in ('institutional', 'responsible', 'alternate')),
	CONSTRAINT "institution_contacts_name_valid" CHECK ("institution_contacts"."name" is null or (length(trim("institution_contacts"."name")) between 2 and 120 and "institution_contacts"."name" !~ '[<>]')),
	CONSTRAINT "institution_contacts_position_valid" CHECK ("institution_contacts"."position" is null or (length(trim("institution_contacts"."position")) between 2 and 80 and "institution_contacts"."position" !~ '[<>]')),
	CONSTRAINT "institution_contacts_area_valid" CHECK ("institution_contacts"."area" is null or (length(trim("institution_contacts"."area")) between 2 and 120 and "institution_contacts"."area" !~ '[<>]')),
	CONSTRAINT "institution_contacts_email_valid" CHECK ("institution_contacts"."email" is null or (length("institution_contacts"."email") <= 254 and "institution_contacts"."email" ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$')),
	CONSTRAINT "institution_contacts_phone_valid" CHECK ("institution_contacts"."phone" is null or (length("institution_contacts"."phone") <= 30 and "institution_contacts"."phone" ~ '^[+]?[0-9 ()-]+$' and length(regexp_replace("institution_contacts"."phone", '[^0-9]', '', 'g')) >= 6)),
	CONSTRAINT "institution_contacts_shape_valid" CHECK (("institution_contacts"."kind" = 'institutional' and "institution_contacts"."email" is not null and "institution_contacts"."phone" is not null and "institution_contacts"."profile_id" is null)
    or ("institution_contacts"."kind" = 'responsible' and "institution_contacts"."profile_id" is not null and "institution_contacts"."position" is not null and "institution_contacts"."area" is not null and "institution_contacts"."email" is not null)
    or ("institution_contacts"."kind" = 'alternate' and "institution_contacts"."name" is not null and ("institution_contacts"."email" is not null or "institution_contacts"."phone" is not null) and "institution_contacts"."profile_id" is null))
);
--> statement-breakpoint
ALTER TABLE "institution_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "institution_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "institution_type" NOT NULL,
	"locality" text NOT NULL,
	"display_name" text,
	"education_level" text,
	"sector" text,
	"company_size" text,
	"organization_kind" text,
	"tax_id" text,
	"website" text,
	"country" text,
	"province" text,
	"postal_code" text,
	"address" text,
	"message" text DEFAULT '' NOT NULL,
	"authorized_at" timestamp with time zone,
	"created_by" uuid,
	"created_by_nexus" boolean DEFAULT false NOT NULL,
	"status" "institution_registration_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"rejection_reason" text,
	"institution_id" uuid,
	CONSTRAINT "institution_registrations_name_valid" CHECK (length(trim("institution_registrations"."name")) between 2 and 160 and "institution_registrations"."name" !~ '[<>]'),
	CONSTRAINT "institution_registrations_locality_valid" CHECK (length(trim("institution_registrations"."locality")) between 2 and 120 and "institution_registrations"."locality" !~ '[<>]'),
	CONSTRAINT "institution_registrations_message_valid" CHECK (length("institution_registrations"."message") <= 1000 and "institution_registrations"."message" !~ '[<>]'),
	CONSTRAINT "institution_registrations_display_name_valid" CHECK ("institution_registrations"."display_name" is null or (length(trim("institution_registrations"."display_name")) between 2 and 80 and "institution_registrations"."display_name" !~ '[<>]')),
	CONSTRAINT "institution_registrations_education_level_valid" CHECK ("institution_registrations"."education_level" is null or "institution_registrations"."education_level" in ('university', 'tertiary', 'secondary', 'vocational', 'other')),
	CONSTRAINT "institution_registrations_sector_valid" CHECK ("institution_registrations"."sector" is null or "institution_registrations"."sector" in ('technology', 'industry', 'commerce', 'services', 'finance', 'health', 'agro', 'construction', 'energy', 'other')),
	CONSTRAINT "institution_registrations_company_size_valid" CHECK ("institution_registrations"."company_size" is null or "institution_registrations"."company_size" in ('1-10', '11-50', '51-200', '201-1000', '1000+')),
	CONSTRAINT "institution_registrations_organization_kind_valid" CHECK ("institution_registrations"."organization_kind" is null or "institution_registrations"."organization_kind" in ('direct', 'branches')),
	CONSTRAINT "institution_registrations_tax_id_valid" CHECK ("institution_registrations"."tax_id" is null or (length(trim("institution_registrations"."tax_id")) between 3 and 40 and "institution_registrations"."tax_id" !~ '[<>]')),
	CONSTRAINT "institution_registrations_website_valid" CHECK ("institution_registrations"."website" is null or (length("institution_registrations"."website") <= 200 and "institution_registrations"."website" ~ '^https://[^[:space:]<>"'']+[.][^[:space:]<>"'']+$')),
	CONSTRAINT "institution_registrations_country_valid" CHECK ("institution_registrations"."country" is null or "institution_registrations"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "institution_registrations_province_valid" CHECK ("institution_registrations"."province" is null or (length(trim("institution_registrations"."province")) between 2 and 100 and "institution_registrations"."province" !~ '[<>]')),
	CONSTRAINT "institution_registrations_postal_code_valid" CHECK ("institution_registrations"."postal_code" is null or (length(trim("institution_registrations"."postal_code")) between 3 and 12 and "institution_registrations"."postal_code" !~ '[<>]')),
	CONSTRAINT "institution_registrations_address_valid" CHECK ("institution_registrations"."address" is null or (length(trim("institution_registrations"."address")) between 3 and 200 and "institution_registrations"."address" !~ '[<>]')),
	CONSTRAINT "institution_registrations_reason_valid" CHECK ("institution_registrations"."rejection_reason" is null or (length(trim("institution_registrations"."rejection_reason")) between 3 and 1000 and "institution_registrations"."rejection_reason" !~ '[<>]')),
	CONSTRAINT "institution_registrations_resolution_valid" CHECK (("institution_registrations"."status" = 'pending' and "institution_registrations"."resolved_at" is null and "institution_registrations"."resolved_by" is null and "institution_registrations"."rejection_reason" is null and "institution_registrations"."institution_id" is null)
    or ("institution_registrations"."status" = 'approved' and "institution_registrations"."resolved_at" is not null and "institution_registrations"."resolved_by" is not null and "institution_registrations"."rejection_reason" is null and "institution_registrations"."institution_id" is not null)
    or ("institution_registrations"."status" = 'rejected' and "institution_registrations"."resolved_at" is not null and "institution_registrations"."resolved_by" is not null and "institution_registrations"."rejection_reason" is not null and "institution_registrations"."institution_id" is null))
);
--> statement-breakpoint
ALTER TABLE "institution_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nexus_admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_profile_id" uuid,
	"registration_id" uuid,
	"institution_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexus_admin_actions_action_valid" CHECK ("nexus_admin_actions"."action" in ('grant_admin', 'revoke_admin', 'approve_institution', 'reject_institution', 'create_institution', 'add_institution_admin')),
	CONSTRAINT "nexus_admin_actions_actor_valid" CHECK ("nexus_admin_actions"."actor_id" is not null or "nexus_admin_actions"."action" = 'grant_admin')
);
--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nexus_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "nexus_admins_revocation_valid" CHECK (("nexus_admins"."revoked_at" is null) = ("nexus_admins"."revoked_by" is null))
);
--> statement-breakpoint
ALTER TABLE "nexus_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "education_level" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "organization_kind" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "institution_contacts" ADD CONSTRAINT "institution_contacts_registration_id_institution_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."institution_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_contacts" ADD CONSTRAINT "institution_contacts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_contacts" ADD CONSTRAINT "institution_contacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_registration_id_institution_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."institution_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_revoked_by_profiles_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_contacts_registration_idx" ON "institution_contacts" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "institution_contacts_institution_idx" ON "institution_contacts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "institution_registrations_profile_idx" ON "institution_registrations" USING btree ("profile_id","status");--> statement-breakpoint
CREATE INDEX "institution_registrations_status_idx" ON "institution_registrations" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "nexus_admin_actions_created_idx" ON "nexus_admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nexus_admins_active_unique" ON "nexus_admins" USING btree ("profile_id") WHERE "nexus_admins"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_legal_name_valid" CHECK ("institutions"."legal_name" is null or (length(trim("institutions"."legal_name")) between 2 and 160 and "institutions"."legal_name" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_locality_valid" CHECK ("institutions"."locality" is null or (length(trim("institutions"."locality")) between 2 and 120 and "institutions"."locality" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_display_name_valid" CHECK ("institutions"."display_name" is null or (length(trim("institutions"."display_name")) between 2 and 80 and "institutions"."display_name" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_education_level_valid" CHECK ("institutions"."education_level" is null or "institutions"."education_level" in ('university', 'tertiary', 'secondary', 'vocational', 'other'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_sector_valid" CHECK ("institutions"."sector" is null or "institutions"."sector" in ('technology', 'industry', 'commerce', 'services', 'finance', 'health', 'agro', 'construction', 'energy', 'other'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_company_size_valid" CHECK ("institutions"."company_size" is null or "institutions"."company_size" in ('1-10', '11-50', '51-200', '201-1000', '1000+'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_organization_kind_valid" CHECK ("institutions"."organization_kind" is null or "institutions"."organization_kind" in ('direct', 'branches'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_tax_id_valid" CHECK ("institutions"."tax_id" is null or (length(trim("institutions"."tax_id")) between 3 and 40 and "institutions"."tax_id" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_website_valid" CHECK ("institutions"."website" is null or (length("institutions"."website") <= 200 and "institutions"."website" ~ '^https://[^[:space:]<>"'']+[.][^[:space:]<>"'']+$'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_country_valid" CHECK ("institutions"."country" is null or "institutions"."country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_province_valid" CHECK ("institutions"."province" is null or (length(trim("institutions"."province")) between 2 and 100 and "institutions"."province" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_postal_code_valid" CHECK ("institutions"."postal_code" is null or (length(trim("institutions"."postal_code")) between 3 and 12 and "institutions"."postal_code" !~ '[<>]'));--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_address_valid" CHECK ("institutions"."address" is null or (length(trim("institutions"."address")) between 3 and 200 and "institutions"."address" !~ '[<>]'));
--> statement-breakpoint
-- #6 (D-16, D-17, D-18, D-41 to D-43): NEXUS administration and registration of institutions.
-- Existing institutions are not touched (they stay as they are, with the new profile columns null).
-- Privileges: the app never writes these tables directly; it calls the SECURITY DEFINER functions below, which only
-- the server (service_role) may execute. anon and authenticated get nothing; contacts are never readable by them.
REVOKE ALL ON public.institution_registrations, public.institution_contacts, public.nexus_admins, public.nexus_admin_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.institution_registrations, public.institution_contacts, public.nexus_admins, public.nexus_admin_actions TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.is_nexus_admin(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = actor AND revoked_at IS NULL)
$$;
--> statement-breakpoint
-- NEXUS admins: only an active NEXUS admin grants the role (the very first one, with granted_by null, only while
-- there is no active admin at all); only revoking is allowed afterwards (by an active admin, also oneself), never
-- the last active admin; rows are never deleted. Serialized so the rules hold under concurrency.
CREATE FUNCTION public.guard_nexus_admins() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('public.nexus_admins'));
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'NEXUS admins are never deleted; revoke the role instead'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL THEN RAISE EXCEPTION 'A new NEXUS admin starts active'; END IF;
  IF NEW.granted_by IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.nexus_admins WHERE revoked_at IS NULL) THEN RAISE EXCEPTION 'Only an active NEXUS admin can grant the role'; END IF;
  ELSIF NEW.granted_by = NEW.profile_id OR NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = NEW.granted_by AND revoked_at IS NULL) THEN
   RAISE EXCEPTION 'Only an active NEXUS admin can grant the role';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.id <> OLD.id OR NEW.profile_id <> OLD.profile_id OR NEW.granted_by IS DISTINCT FROM OLD.granted_by OR NEW.granted_at <> OLD.granted_at
   OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
  RAISE EXCEPTION 'A NEXUS admin row only changes by revoking an active admin';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = NEW.revoked_by AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Only an active NEXUS admin can revoke the role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE revoked_at IS NULL AND id <> OLD.id) THEN RAISE EXCEPTION 'Cannot revoke the last NEXUS admin'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER nexus_admins_guard BEFORE INSERT OR UPDATE OR DELETE ON public.nexus_admins FOR EACH ROW EXECUTE FUNCTION public.guard_nexus_admins();
--> statement-breakpoint
-- D-41: legal name + country + province + locality are unique among institutions and pending registrations, compared
-- without upper case, accents or extra spaces. Same normalization as the app (normalizeForCompare).
CREATE FUNCTION public.normalize_institution_text(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
 SELECT btrim(regexp_replace(lower(translate(coalesce(value, ''),
  'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
  'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '\s+', ' ', 'g'))
$$;
--> statement-breakpoint
-- CUIT (Argentina): 11 digits and its check digit (weights 5,4,3,2,7,6,5,4,3,2; 11 - sum mod 11; 11 -> 0; 10 invalid).
CREATE FUNCTION public.valid_cuit(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE weights int[] := ARRAY[5,4,3,2,7,6,5,4,3,2]; total int := 0; rest int;
BEGIN
 IF value IS NULL OR value !~ '^[0-9]{11}$' THEN RETURN false; END IF;
 FOR i IN 1..10 LOOP total := total + weights[i] * substr(value, i, 1)::int; END LOOP;
 rest := 11 - (total % 11);
 IF rest = 10 THEN RETURN false; END IF;
 RETURN (CASE WHEN rest = 11 THEN 0 ELSE rest END) = substr(value, 11, 1)::int;
END $$;
--> statement-breakpoint
-- Registrations: they start pending; a person has at most 3 pending (a NEXUS admin creating one for someone else is
-- not limited); mandatory data by type of institution and country; unique legal name + place and unique tax id;
-- only an active NEXUS admin resolves them, once; their content never changes; an approval must have created the
-- institution with the same data and made the registrant its administrator.
CREATE FUNCTION public.guard_institution_registrations() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Institution registrations are never deleted'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'pending' THEN RAISE EXCEPTION 'A new institution registration starts pending'; END IF;
  IF NEW.created_by_nexus THEN
   IF NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = NEW.created_by AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Only an active NEXUS admin can create an institution for someone else';
   END IF;
  ELSIF NEW.created_by IS DISTINCT FROM NEW.profile_id THEN
   RAISE EXCEPTION 'A registration is sent by its registrant';
  ELSE
   PERFORM pg_advisory_xact_lock(hashtext('public.institution_registrations:' || NEW.profile_id::text));
   IF (SELECT count(*) FROM public.institution_registrations WHERE profile_id = NEW.profile_id AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'At most 3 pending institution registrations per person';
   END IF;
  END IF;
  IF NEW.authorized_at IS NULL THEN RAISE EXCEPTION 'The registrant must declare being authorized to register the institution'; END IF;
  IF NEW.country IS NULL OR NEW.province IS NULL OR NEW.postal_code IS NULL OR NEW.organization_kind IS NULL THEN
   RAISE EXCEPTION 'Country, province, postal code and organization kind are required';
  END IF;
  IF (NEW.type = 'educational') <> (NEW.education_level IS NOT NULL)
    OR (NEW.type = 'company') <> (NEW.sector IS NOT NULL) OR (NEW.type = 'company') <> (NEW.company_size IS NOT NULL) THEN
   RAISE EXCEPTION 'Education level only for educational institutions; sector and size only (and always) for companies';
  END IF;
  IF NEW.country = 'AR' AND NEW.province NOT IN ('Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes',
    'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
    'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán') THEN
   RAISE EXCEPTION 'Unknown Argentine province';
  END IF;
  IF NEW.country = 'AR' AND NEW.tax_id IS NOT NULL AND NOT public.valid_cuit(NEW.tax_id) THEN RAISE EXCEPTION 'Invalid CUIT'; END IF;
  IF EXISTS(SELECT 1 FROM public.institutions WHERE public.normalize_institution_text(legal_name) = public.normalize_institution_text(NEW.name)
      AND country = NEW.country AND public.normalize_institution_text(province) = public.normalize_institution_text(NEW.province)
      AND public.normalize_institution_text(locality) = public.normalize_institution_text(NEW.locality))
    OR EXISTS(SELECT 1 FROM public.institution_registrations WHERE status = 'pending'
      AND public.normalize_institution_text(name) = public.normalize_institution_text(NEW.name) AND country = NEW.country
      AND public.normalize_institution_text(province) = public.normalize_institution_text(NEW.province)
      AND public.normalize_institution_text(locality) = public.normalize_institution_text(NEW.locality)) THEN
   RAISE EXCEPTION 'An institution with that name already exists in that locality';
  END IF;
  IF NEW.tax_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.institutions WHERE tax_id = NEW.tax_id)
    OR EXISTS(SELECT 1 FROM public.institution_registrations WHERE status = 'pending' AND tax_id = NEW.tax_id)) THEN
   RAISE EXCEPTION 'An institution with that tax id already exists';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.status <> 'pending' OR NEW.status = 'pending'
   OR to_jsonb(NEW) - ARRAY['status', 'resolved_at', 'resolved_by', 'rejection_reason', 'institution_id']
      IS DISTINCT FROM to_jsonb(OLD) - ARRAY['status', 'resolved_at', 'resolved_by', 'rejection_reason', 'institution_id'] THEN
  RAISE EXCEPTION 'Resolved institution registrations and their content are immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = NEW.resolved_by AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration';
 END IF;
 IF NEW.status = 'approved' AND (
   NOT EXISTS(SELECT 1 FROM public.institutions WHERE id = NEW.institution_id AND legal_name = OLD.name AND type = OLD.type AND locality = OLD.locality
     AND country IS NOT DISTINCT FROM OLD.country AND province IS NOT DISTINCT FROM OLD.province AND tax_id IS NOT DISTINCT FROM OLD.tax_id)
   OR NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id = NEW.institution_id AND profile_id = OLD.profile_id AND role = 'admin' AND status = 'active')
   OR EXISTS(SELECT 1 FROM public.institution_registrations WHERE institution_id = NEW.institution_id AND id <> OLD.id)) THEN
  RAISE EXCEPTION 'Approval must create the institution and make the registrant its administrator';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER institution_registrations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.institution_registrations FOR EACH ROW EXECUTE FUNCTION public.guard_institution_registrations();
-- The same uniqueness under concurrency. Institutions created before 0034 (legal name and tax id null) are not affected.
CREATE UNIQUE INDEX institutions_legal_name_place_unique ON public.institutions (public.normalize_institution_text(legal_name), country, public.normalize_institution_text(province), public.normalize_institution_text(locality)) WHERE legal_name IS NOT NULL;
CREATE UNIQUE INDEX institution_registrations_pending_name_place_unique ON public.institution_registrations (public.normalize_institution_text(name), country, public.normalize_institution_text(province), public.normalize_institution_text(locality)) WHERE status = 'pending';
CREATE UNIQUE INDEX institutions_tax_id_unique ON public.institutions (tax_id) WHERE tax_id IS NOT NULL;
CREATE UNIQUE INDEX institution_registrations_pending_tax_id_unique ON public.institution_registrations (tax_id) WHERE status = 'pending' AND tax_id IS NOT NULL;
--> statement-breakpoint
-- A new registration must have, at commit, its institutional and responsible contacts (the responsible one is the
-- registrant). Registrations created before this rule existed are not affected (the check only fires on INSERT).
CREATE FUNCTION public.check_registration_contacts() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.institution_contacts WHERE registration_id = NEW.id AND kind = 'institutional')
   OR NOT EXISTS(SELECT 1 FROM public.institution_contacts WHERE registration_id = NEW.id AND kind = 'responsible' AND profile_id = NEW.profile_id) THEN
  RAISE EXCEPTION 'A registration needs its institutional contact and its responsible person';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER institution_registrations_contacts AFTER INSERT ON public.institution_registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_registration_contacts();
--> statement-breakpoint
-- Contacts: added only while their registration is pending (one institutional and one responsible at most; the
-- responsible one is the registrant); afterwards the only change is linking them to the institution created by the
-- approval. Never deleted.
CREATE FUNCTION public.guard_institution_contacts() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.institution_registrations;
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Institution contacts are never deleted'; END IF;
 SELECT * INTO r FROM public.institution_registrations WHERE id = NEW.registration_id;
 IF TG_OP = 'INSERT' THEN
  IF r.status <> 'pending' OR NEW.institution_id IS NOT NULL THEN RAISE EXCEPTION 'Contacts are added only to a pending registration'; END IF;
  IF NEW.kind = 'responsible' AND NEW.profile_id IS DISTINCT FROM r.profile_id THEN RAISE EXCEPTION 'The responsible contact is the registrant'; END IF;
  RETURN NEW;
 END IF;
 IF to_jsonb(NEW) - 'institution_id' IS DISTINCT FROM to_jsonb(OLD) - 'institution_id' OR OLD.institution_id IS NOT NULL
   OR NEW.institution_id IS DISTINCT FROM r.institution_id OR r.status <> 'approved' THEN
  RAISE EXCEPTION 'Contacts only change by being linked to the approved institution';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER institution_contacts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.institution_contacts FOR EACH ROW EXECUTE FUNCTION public.guard_institution_contacts();
CREATE UNIQUE INDEX institution_contacts_one_per_kind ON public.institution_contacts (registration_id, kind) WHERE kind IN ('institutional', 'responsible');
--> statement-breakpoint
-- Every NEW institution must be born from a registration approved in the same transaction (checked at commit).
-- Institutions that already exist are not touched: the trigger only fires on INSERT.
CREATE FUNCTION public.check_institution_from_registration() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.institution_registrations WHERE institution_id = NEW.id AND status = 'approved') THEN
  RAISE EXCEPTION 'New institutions require an approved institution registration';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER institutions_from_registration AFTER INSERT ON public.institutions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_institution_from_registration();
--> statement-breakpoint
-- Every NEXUS administration action is recorded by triggers, also when an operator script runs it: who to whom.
CREATE FUNCTION public.audit_nexus_admins() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  INSERT INTO public.nexus_admin_actions(actor_id, action, target_profile_id, details)
  VALUES (NEW.granted_by, 'grant_admin', NEW.profile_id, jsonb_build_object('first', NEW.granted_by IS NULL));
 ELSE
  INSERT INTO public.nexus_admin_actions(actor_id, action, target_profile_id) VALUES (NEW.revoked_by, 'revoke_admin', NEW.profile_id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER nexus_admins_audit AFTER INSERT OR UPDATE ON public.nexus_admins FOR EACH ROW EXECUTE FUNCTION public.audit_nexus_admins();
--> statement-breakpoint
-- Approving a registration made by a NEXUS admin for someone else is recorded as "create_institution" (D-43).
CREATE FUNCTION public.audit_institution_registrations() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 INSERT INTO public.nexus_admin_actions(actor_id, action, target_profile_id, registration_id, institution_id, details)
 VALUES (NEW.resolved_by,
   CASE WHEN NEW.status = 'rejected' THEN 'reject_institution' WHEN NEW.created_by_nexus THEN 'create_institution' ELSE 'approve_institution' END,
   NEW.profile_id, NEW.id, NEW.institution_id,
   CASE WHEN NEW.status = 'rejected' THEN jsonb_build_object('reason', NEW.rejection_reason) ELSE '{}'::jsonb END);
 RETURN NULL;
END $$;
CREATE TRIGGER institution_registrations_audit AFTER UPDATE ON public.institution_registrations FOR EACH ROW EXECUTE FUNCTION public.audit_institution_registrations();
--> statement-breakpoint
-- The action record is append-only; none of the NEXUS administration tables can be truncated.
CREATE FUNCTION public.reject_nexus_admin_history_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'NEXUS administration history is append-only';
END $$;
CREATE TRIGGER nexus_admin_actions_append_only BEFORE UPDATE OR DELETE ON public.nexus_admin_actions FOR EACH ROW EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER nexus_admin_actions_no_truncate BEFORE TRUNCATE ON public.nexus_admin_actions FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER nexus_admins_no_truncate BEFORE TRUNCATE ON public.nexus_admins FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER institution_registrations_no_truncate BEFORE TRUNCATE ON public.institution_registrations FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER institution_contacts_no_truncate BEFORE TRUNCATE ON public.institution_contacts FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
--> statement-breakpoint
-- Internal: inserts a registration and its contacts from the form data (jsonb with the app's field names). Not
-- executable by the app; used by register_institution and nexus_create_institution.
CREATE FUNCTION public.insert_institution_registration(person uuid, creator uuid, by_nexus boolean, responsible_email text, data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE registration uuid; v text;
BEGIN
 INSERT INTO public.institution_registrations(profile_id, created_by, created_by_nexus, name, display_name, type, education_level, sector, company_size,
   organization_kind, tax_id, website, country, province, locality, postal_code, address, message, authorized_at)
 VALUES (person, creator, by_nexus, btrim(data->>'legalName'), nullif(btrim(data->>'displayName'), ''), (data->>'kind')::public.institution_type,
   nullif(data->>'educationLevel', ''), nullif(data->>'sector', ''), nullif(data->>'companySize', ''), data->>'organizationKind',
   nullif(btrim(data->>'taxId'), ''), nullif(btrim(data->>'website'), ''), data->>'country', btrim(data->>'province'), btrim(data->>'locality'),
   btrim(data->>'postalCode'), nullif(btrim(data->>'address'), ''), coalesce(btrim(data->>'message'), ''), now())
 RETURNING id INTO registration;
 INSERT INTO public.institution_contacts(registration_id, kind, email, phone)
 VALUES (registration, 'institutional', lower(btrim(data->>'institutionalEmail')), btrim(data->>'institutionalPhone'));
 INSERT INTO public.institution_contacts(registration_id, kind, profile_id, position, area, email, phone)
 VALUES (registration, 'responsible', person, btrim(data->>'responsiblePosition'), btrim(data->>'responsibleArea'), lower(btrim(responsible_email)),
   nullif(btrim(data->>'responsiblePhone'), ''));
 IF jsonb_typeof(data->'alternate') = 'object' THEN
  INSERT INTO public.institution_contacts(registration_id, kind, name, position, email, phone)
  VALUES (registration, 'alternate', btrim(data->'alternate'->>'name'), nullif(btrim(data->'alternate'->>'position'), ''),
    nullif(lower(btrim(data->'alternate'->>'email')), ''), nullif(btrim(data->'alternate'->>'phone'), ''));
 END IF;
 RETURN registration;
END $$;
--> statement-breakpoint
-- The only write paths for the app. actor is the signed-in person, verified by the server; the rules are
-- re-checked by the triggers above. responsible_email is the e-mail of the registrant's account (from its session,
-- or found by the NEXUS admin), stored as contact data.
CREATE FUNCTION public.register_institution(actor uuid, responsible_email text, data jsonb) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.insert_institution_registration(actor, actor, false, responsible_email, data)
$$;
--> statement-breakpoint
CREATE FUNCTION public.approve_institution_registration(actor uuid, registration uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.institution_registrations; created uuid;
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration'; END IF;
 SELECT * INTO r FROM public.institution_registrations WHERE id = registration FOR UPDATE;
 IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'The institution registration is no longer pending'; END IF;
 INSERT INTO public.institutions(name, legal_name, display_name, type, education_level, sector, company_size, organization_kind, tax_id, website,
   country, province, locality, postal_code, address)
 VALUES (coalesce(r.display_name, r.name), r.name, r.display_name, r.type, r.education_level, r.sector, r.company_size, r.organization_kind, r.tax_id, r.website,
   r.country, r.province, r.locality, r.postal_code, r.address)
 RETURNING id INTO created;
 -- D-43: whoever registered it becomes its first administrator only now, on approval.
 INSERT INTO public.institution_members(institution_id, profile_id, role, granted_by) VALUES (created, r.profile_id, 'admin', actor);
 UPDATE public.institution_registrations SET status = 'approved', resolved_at = now(), resolved_by = actor, institution_id = created WHERE id = registration;
 UPDATE public.institution_contacts SET institution_id = created WHERE registration_id = registration;
 RETURN created;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.reject_institution_registration(actor uuid, registration uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration'; END IF;
 UPDATE public.institution_registrations SET status = 'rejected', resolved_at = now(), resolved_by = actor, rejection_reason = btrim(reason)
 WHERE id = registration AND status = 'pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'The institution registration is no longer pending'; END IF;
END $$;
--> statement-breakpoint
-- D-43: a NEXUS admin creates an institution asked for by phone or e-mail, for a person with an account who becomes
-- its main admin: registration + approval in the same transaction, recorded as "create_institution".
CREATE FUNCTION public.nexus_create_institution(actor uuid, person uuid, responsible_email text, data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can create an institution for someone else'; END IF;
 RETURN public.approve_institution_registration(actor, public.insert_institution_registration(person, actor, true, responsible_email, data));
END $$;
--> statement-breakpoint
-- D-43: a NEXUS admin adds an admin to an institution (by the person's account), with a required reason, recorded.
-- Never someone the institution removed (revoked). There is no function to remove admins: a NEXUS admin cannot take the role away from an institution's admins.
CREATE FUNCTION public.nexus_add_institution_admin(actor uuid, institution uuid, person uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.institution_members; clean text := btrim(coalesce(reason, ''));
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can add an institution admin'; END IF;
 IF length(clean) NOT BETWEEN 3 AND 1000 OR clean ~ '[<>]' THEN RAISE EXCEPTION 'A reason between 3 and 1000 characters is required'; END IF;
 PERFORM 1 FROM public.institutions WHERE id = institution FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown institution'; END IF;
 SELECT * INTO m FROM public.institution_members WHERE institution_id = institution AND profile_id = person FOR UPDATE;
 IF FOUND AND m.role = 'admin' AND m.status = 'active' THEN RAISE EXCEPTION 'The person is already an admin of this institution'; END IF;
 -- A person removed (revoked) by the institution is never brought back by NEXUS: the institution has to add them again.
 IF FOUND AND m.status = 'revoked' THEN RAISE EXCEPTION 'The person was removed by the institution'; END IF;
 IF FOUND THEN
  UPDATE public.institution_members SET role = 'admin', status = 'active', revision = m.revision + 1, granted_by = actor, updated_at = now() WHERE id = m.id;
 ELSE
  INSERT INTO public.institution_members(institution_id, profile_id, role, granted_by) VALUES (institution, person, 'admin', actor);
 END IF;
 INSERT INTO public.nexus_admin_actions(actor_id, action, target_profile_id, institution_id, details)
 VALUES (actor, 'add_institution_admin', person, institution, jsonb_build_object('reason', clean));
END $$;
--> statement-breakpoint
CREATE FUNCTION public.grant_nexus_admin(actor uuid, person uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.nexus_admins(profile_id, granted_by) VALUES (person, actor);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.revoke_nexus_admin(actor uuid, person uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 UPDATE public.nexus_admins SET revoked_at = now(), revoked_by = actor WHERE profile_id = person AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'The person is not an active NEXUS admin'; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_nexus_admins(), public.guard_institution_registrations(), public.audit_nexus_admins(),
 public.audit_institution_registrations(), public.reject_nexus_admin_history_change(), public.check_institution_from_registration(),
 public.check_registration_contacts(), public.guard_institution_contacts(), public.normalize_institution_text(text), public.valid_cuit(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_institution_registration(uuid, uuid, boolean, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_nexus_admin(uuid), public.register_institution(uuid, text, jsonb), public.approve_institution_registration(uuid, uuid),
 public.reject_institution_registration(uuid, uuid, text), public.nexus_create_institution(uuid, uuid, text, jsonb),
 public.nexus_add_institution_admin(uuid, uuid, uuid, text), public.grant_nexus_admin(uuid, uuid), public.revoke_nexus_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_nexus_admin(uuid), public.register_institution(uuid, text, jsonb), public.approve_institution_registration(uuid, uuid),
 public.reject_institution_registration(uuid, uuid, text), public.nexus_create_institution(uuid, uuid, text, jsonb),
 public.nexus_add_institution_admin(uuid, uuid, uuid, text), public.grant_nexus_admin(uuid, uuid), public.revoke_nexus_admin(uuid, uuid) TO service_role;
