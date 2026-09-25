CREATE TYPE "public"."institution_member_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."institution_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."institution_role" AS ENUM('admin', 'teacher', 'member');--> statement-breakpoint
CREATE TYPE "public"."institution_type" AS ENUM('educational', 'company', 'other');--> statement-breakpoint
CREATE TABLE "institution_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "institution_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "institution_requests_message_valid" CHECK (length("institution_access_requests"."message") <= 1000),
	CONSTRAINT "institution_requests_resolution_valid" CHECK (("institution_access_requests"."status" = 'pending' and "institution_access_requests"."resolved_at" is null and "institution_access_requests"."resolved_by" is null) or ("institution_access_requests"."status" <> 'pending' and "institution_access_requests"."resolved_at" is not null and "institution_access_requests"."resolved_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "institution_access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "institution_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "institution_role" DEFAULT 'member' NOT NULL,
	"status" "institution_member_status" DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_members_revision_valid" CHECK ("institution_members"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "institution_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "institution_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_name_valid" CHECK (length(trim("institutions"."name")) between 2 and 160)
);
--> statement-breakpoint
ALTER TABLE "institutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD CONSTRAINT "institution_access_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD CONSTRAINT "institution_access_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD CONSTRAINT "institution_access_requests_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_requests_pending_unique" ON "institution_access_requests" USING btree ("institution_id","profile_id") WHERE "institution_access_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "institution_requests_profile_idx" ON "institution_access_requests" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "institution_requests_institution_idx" ON "institution_access_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_members_identity_unique" ON "institution_members" USING btree ("institution_id","profile_id");--> statement-breakpoint
CREATE INDEX "institution_members_profile_idx" ON "institution_members" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_institution_idx" ON "companies" USING btree ("institution_id");
--> statement-breakpoint
-- Existing companies deliberately remain NULL. No institutions or memberships
-- are invented, and existing campaign/card permissions are not rewritten.
REVOKE ALL ON public.institutions, public.institution_members, public.institution_access_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.institutions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.institution_members, public.institution_access_requests TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.company_institution_access(company uuid, actor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=company AND
  (c.institution_id IS NULL OR EXISTS(SELECT 1 FROM public.institution_members m
   WHERE m.institution_id=c.institution_id AND m.profile_id=actor AND m.status='active')))
$$;
REVOKE ALL ON FUNCTION public.company_institution_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_institution_access(uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.company_missing_institution_members(company uuid, institution uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT count(*) FROM (
  SELECT created_by AS profile_id FROM public.companies WHERE id=company
  UNION SELECT m.profile_id FROM public.campaign_members m JOIN public.campaigns c ON c.id=m.campaign_id WHERE c.company_id=company
  UNION SELECT a.profile_id FROM public.game_card_assignments a JOIN public.campaigns c ON c.id=a.campaign_id WHERE c.company_id=company
 ) people WHERE NOT EXISTS(SELECT 1 FROM public.institution_members m
  WHERE m.institution_id=institution AND m.profile_id=people.profile_id AND m.status='active')
$$;
REVOKE ALL ON FUNCTION public.company_missing_institution_members(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_missing_institution_members(uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.institution_pending_requests(institution uuid, actor uuid)
RETURNS TABLE(id uuid, name text, email text, message text, requested_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT r.id,p.display_name,u.email::text,r.message,r.requested_at
 FROM public.institution_access_requests r JOIN public.profiles p ON p.id=r.profile_id JOIN auth.users u ON u.id=p.id
 WHERE r.institution_id=institution AND r.status='pending' AND EXISTS(
  SELECT 1 FROM public.institution_members m WHERE m.institution_id=institution AND m.profile_id=actor AND m.role='admin' AND m.status='active')
 ORDER BY r.requested_at,r.id
$$;
REVOKE ALL ON FUNCTION public.institution_pending_requests(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.institution_pending_requests(uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_company_institution() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.institution_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id=NEW.institution_id AND profile_id=NEW.created_by AND status='active' AND role IN ('admin','teacher')) THEN
   RAISE EXCEPTION 'New companies require an institution and authorized teacher';
  END IF;
 ELSE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Company ownership cannot be reassigned through this flow'; END IF;
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
   actor := nullif(current_setting('nexus.institution_actor',true),'')::uuid;
   IF OLD.institution_id IS NOT NULL OR NEW.institution_id IS NULL OR actor IS DISTINCT FROM OLD.created_by OR NOT EXISTS(
    SELECT 1 FROM public.institution_members WHERE institution_id=NEW.institution_id AND profile_id=actor AND role='admin' AND status='active') THEN
     RAISE EXCEPTION 'Linking requires the company owner and destination administrator; linked companies cannot be moved';
   END IF;
   IF public.company_missing_institution_members(OLD.id,NEW.institution_id)>0 THEN RAISE EXCEPTION 'Existing participants need approved institutional membership before linking'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER companies_institution_guard BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_company_institution();
--> statement-breakpoint
CREATE FUNCTION public.guard_institutional_simulation_permission() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE institution uuid; person uuid;
BEGIN
 IF TG_TABLE_NAME='campaigns' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Campaign company is immutable'; END IF;
   RETURN NEW;
  END IF;
  SELECT institution_id INTO institution FROM public.companies WHERE id=NEW.company_id FOR SHARE;
  person := NEW.created_by;
 ELSIF TG_TABLE_NAME='campaign_members' THEN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  SELECT c.institution_id INTO institution FROM public.companies c JOIN public.campaigns ca ON ca.company_id=c.id WHERE ca.id=NEW.campaign_id FOR SHARE OF c;
  person := NEW.profile_id;
 ELSE
  SELECT c.institution_id INTO institution FROM public.companies c JOIN public.campaigns ca ON ca.company_id=c.id WHERE ca.id=NEW.campaign_id FOR SHARE OF c;
  person := NEW.profile_id;
 END IF;
 IF institution IS NULL THEN RAISE EXCEPTION 'Legacy company must be linked before new permissions or assignments'; END IF;
 PERFORM 1 FROM public.institution_members WHERE institution_id=institution AND profile_id=person AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved institutional membership required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER campaigns_institution_guard BEFORE INSERT OR UPDATE OF company_id ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.guard_institutional_simulation_permission();
CREATE TRIGGER campaign_members_institution_guard BEFORE INSERT OR UPDATE ON public.campaign_members FOR EACH ROW EXECUTE FUNCTION public.guard_institutional_simulation_permission();
CREATE TRIGGER assignments_institution_guard BEFORE INSERT OR UPDATE ON public.game_card_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_institutional_simulation_permission();
--> statement-breakpoint
CREATE FUNCTION public.guard_institution_membership() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.institution_id<>OLD.institution_id OR NEW.profile_id<>OLD.profile_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Institution membership identity is immutable; revision must advance';
 END IF;
 IF OLD.role='admin' AND OLD.status='active' AND (NEW.role<>'admin' OR NEW.status<>'active') THEN
  PERFORM 1 FROM public.institutions WHERE id=OLD.institution_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id=OLD.institution_id AND id<>OLD.id AND role='admin' AND status='active') THEN RAISE EXCEPTION 'Cannot revoke the last institutional administrator'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER institution_members_guard BEFORE UPDATE ON public.institution_members FOR EACH ROW EXECUTE FUNCTION public.guard_institution_membership();
--> statement-breakpoint
CREATE FUNCTION public.guard_institution_request() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.status<>'pending' OR NEW.id<>OLD.id OR NEW.institution_id<>OLD.institution_id OR NEW.profile_id<>OLD.profile_id OR NEW.message<>OLD.message OR NEW.requested_at<>OLD.requested_at OR NEW.status='pending' THEN
  RAISE EXCEPTION 'Resolved requests and request identity are immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id=OLD.institution_id AND profile_id=NEW.resolved_by AND status='active' AND role='admin') THEN RAISE EXCEPTION 'Institution administrator required'; END IF;
 IF NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM public.institution_members WHERE institution_id=OLD.institution_id AND profile_id=OLD.profile_id AND status='active') THEN RAISE EXCEPTION 'Approval must create membership in the same transaction'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER institution_requests_guard BEFORE UPDATE ON public.institution_access_requests FOR EACH ROW EXECUTE FUNCTION public.guard_institution_request();
