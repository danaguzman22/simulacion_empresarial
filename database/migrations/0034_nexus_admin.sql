CREATE TYPE "public"."institution_registration_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "institution_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "institution_type" NOT NULL,
	"locality" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "institution_registration_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"rejection_reason" text,
	"institution_id" uuid,
	CONSTRAINT "institution_registrations_name_valid" CHECK (length(trim("institution_registrations"."name")) between 2 and 160 and "institution_registrations"."name" !~ '[<>]'),
	CONSTRAINT "institution_registrations_locality_valid" CHECK (length(trim("institution_registrations"."locality")) between 2 and 120 and "institution_registrations"."locality" !~ '[<>]'),
	CONSTRAINT "institution_registrations_message_valid" CHECK (length("institution_registrations"."message") <= 1000 and "institution_registrations"."message" !~ '[<>]'),
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
	CONSTRAINT "nexus_admin_actions_action_valid" CHECK ("nexus_admin_actions"."action" in ('grant_admin', 'revoke_admin', 'approve_institution', 'reject_institution')),
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
ALTER TABLE "institutions" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_registrations" ADD CONSTRAINT "institution_registrations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_registration_id_institution_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."institution_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admin_actions" ADD CONSTRAINT "nexus_admin_actions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexus_admins" ADD CONSTRAINT "nexus_admins_revoked_by_profiles_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_registrations_profile_idx" ON "institution_registrations" USING btree ("profile_id","status");--> statement-breakpoint
CREATE INDEX "institution_registrations_status_idx" ON "institution_registrations" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "nexus_admin_actions_created_idx" ON "nexus_admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nexus_admins_active_unique" ON "nexus_admins" USING btree ("profile_id") WHERE "nexus_admins"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_locality_valid" CHECK ("institutions"."locality" is null or (length(trim("institutions"."locality")) between 2 and 120 and "institutions"."locality" !~ '[<>]'));
--> statement-breakpoint
-- #6 (D-16, D-17, D-18, D-41 to D-43): NEXUS administration and registration of institutions.
-- Existing institutions are not touched (they stay as they are, approved, with locality null).
-- Privileges: the app never writes these tables directly; it calls the SECURITY DEFINER functions below, which only
-- the server (service_role) may execute. anon and authenticated get nothing.
REVOKE ALL ON public.institution_registrations, public.nexus_admins, public.nexus_admin_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.institution_registrations, public.nexus_admins, public.nexus_admin_actions TO service_role;
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
-- D-41 (updated 22/11/2026): name + locality are unique among approved institutions and pending registrations,
-- compared without upper case, accents or extra spaces. Same normalization as the app (normalizeForCompare).
CREATE FUNCTION public.normalize_institution_text(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
 SELECT btrim(regexp_replace(lower(translate(coalesce(value, ''),
  'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
  'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '\s+', ' ', 'g'))
$$;
--> statement-breakpoint
-- Registrations: they start pending, at most 3 pending per person; only an active NEXUS admin resolves them, once;
-- their content never changes; an approval must have made the registrant the admin of a matching new institution.
CREATE FUNCTION public.guard_institution_registrations() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Institution registrations are never deleted'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'pending' THEN RAISE EXCEPTION 'A new institution registration starts pending'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.institution_registrations:' || NEW.profile_id::text));
  IF (SELECT count(*) FROM public.institution_registrations WHERE profile_id = NEW.profile_id AND status = 'pending') >= 3 THEN
   RAISE EXCEPTION 'At most 3 pending institution registrations per person';
  END IF;
  IF EXISTS(SELECT 1 FROM public.institutions WHERE public.normalize_institution_text(name) = public.normalize_institution_text(NEW.name)
      AND public.normalize_institution_text(locality) = public.normalize_institution_text(NEW.locality))
    OR EXISTS(SELECT 1 FROM public.institution_registrations WHERE status = 'pending'
      AND public.normalize_institution_text(name) = public.normalize_institution_text(NEW.name)
      AND public.normalize_institution_text(locality) = public.normalize_institution_text(NEW.locality)) THEN
   RAISE EXCEPTION 'An institution with that name already exists in that locality';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.status <> 'pending' OR NEW.status = 'pending' OR NEW.id <> OLD.id OR NEW.profile_id <> OLD.profile_id OR NEW.name <> OLD.name
   OR NEW.type <> OLD.type OR NEW.locality <> OLD.locality OR NEW.message <> OLD.message OR NEW.requested_at <> OLD.requested_at THEN
  RAISE EXCEPTION 'Resolved institution registrations and their content are immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nexus_admins WHERE profile_id = NEW.resolved_by AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration';
 END IF;
 IF NEW.status = 'approved' AND (
   NOT EXISTS(SELECT 1 FROM public.institutions WHERE id = NEW.institution_id AND name = OLD.name AND type = OLD.type AND locality = OLD.locality)
   OR NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id = NEW.institution_id AND profile_id = OLD.profile_id AND role = 'admin' AND status = 'active')
   OR EXISTS(SELECT 1 FROM public.institution_registrations WHERE institution_id = NEW.institution_id AND id <> OLD.id)) THEN
  RAISE EXCEPTION 'Approval must create the institution and make the registrant its administrator';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER institution_registrations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.institution_registrations FOR EACH ROW EXECUTE FUNCTION public.guard_institution_registrations();
-- The same rule under concurrency: two pending registrations, or two institutions with locality, can never share
-- name + locality. Institutions created before 0034 (locality null) are not affected.
CREATE UNIQUE INDEX institutions_name_locality_unique ON public.institutions (public.normalize_institution_text(name), public.normalize_institution_text(locality)) WHERE locality IS NOT NULL;
CREATE UNIQUE INDEX institution_registrations_pending_name_locality_unique ON public.institution_registrations (public.normalize_institution_text(name), public.normalize_institution_text(locality)) WHERE status = 'pending';
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
CREATE FUNCTION public.audit_institution_registrations() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 INSERT INTO public.nexus_admin_actions(actor_id, action, target_profile_id, registration_id, institution_id, details)
 VALUES (NEW.resolved_by, CASE NEW.status WHEN 'approved' THEN 'approve_institution' ELSE 'reject_institution' END, NEW.profile_id, NEW.id, NEW.institution_id,
   CASE WHEN NEW.status = 'rejected' THEN jsonb_build_object('reason', NEW.rejection_reason) ELSE '{}'::jsonb END);
 RETURN NULL;
END $$;
CREATE TRIGGER institution_registrations_audit AFTER UPDATE ON public.institution_registrations FOR EACH ROW EXECUTE FUNCTION public.audit_institution_registrations();
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
-- The action record is append-only; none of the three tables can be truncated.
CREATE FUNCTION public.reject_nexus_admin_history_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'NEXUS administration history is append-only';
END $$;
CREATE TRIGGER nexus_admin_actions_append_only BEFORE UPDATE OR DELETE ON public.nexus_admin_actions FOR EACH ROW EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER nexus_admin_actions_no_truncate BEFORE TRUNCATE ON public.nexus_admin_actions FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER nexus_admins_no_truncate BEFORE TRUNCATE ON public.nexus_admins FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
CREATE TRIGGER institution_registrations_no_truncate BEFORE TRUNCATE ON public.institution_registrations FOR EACH STATEMENT EXECUTE FUNCTION public.reject_nexus_admin_history_change();
--> statement-breakpoint
-- The only write paths for the app. actor is the signed-in person, verified by the server; the rules are
-- re-checked by the triggers above.
CREATE FUNCTION public.register_institution(actor uuid, institution_name text, kind public.institution_type, institution_locality text, note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE registration uuid;
BEGIN
 INSERT INTO public.institution_registrations(profile_id, name, type, locality, message)
 VALUES (actor, trim(institution_name), kind, trim(institution_locality), coalesce(trim(note), ''))
 RETURNING id INTO registration;
 RETURN registration;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.approve_institution_registration(actor uuid, registration uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.institution_registrations; created uuid;
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration'; END IF;
 SELECT * INTO r FROM public.institution_registrations WHERE id = registration FOR UPDATE;
 IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'The institution registration is no longer pending'; END IF;
 INSERT INTO public.institutions(name, type, locality) VALUES (r.name, r.type, r.locality) RETURNING id INTO created;
 -- D-43: whoever registered it becomes its first administrator only now, on approval.
 INSERT INTO public.institution_members(institution_id, profile_id, role, granted_by) VALUES (created, r.profile_id, 'admin', actor);
 UPDATE public.institution_registrations SET status = 'approved', resolved_at = now(), resolved_by = actor, institution_id = created WHERE id = registration;
 RETURN created;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.reject_institution_registration(actor uuid, registration uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_nexus_admin(actor) THEN RAISE EXCEPTION 'Only an active NEXUS admin can resolve an institution registration'; END IF;
 UPDATE public.institution_registrations SET status = 'rejected', resolved_at = now(), resolved_by = actor, rejection_reason = trim(reason)
 WHERE id = registration AND status = 'pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'The institution registration is no longer pending'; END IF;
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
 public.normalize_institution_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_nexus_admin(uuid), public.register_institution(uuid, text, public.institution_type, text, text),
 public.approve_institution_registration(uuid, uuid), public.reject_institution_registration(uuid, uuid, text),
 public.grant_nexus_admin(uuid, uuid), public.revoke_nexus_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_nexus_admin(uuid), public.register_institution(uuid, text, public.institution_type, text, text),
 public.approve_institution_registration(uuid, uuid), public.reject_institution_registration(uuid, uuid, text),
 public.grant_nexus_admin(uuid, uuid), public.revoke_nexus_admin(uuid, uuid) TO service_role;
