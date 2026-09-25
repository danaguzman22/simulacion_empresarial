CREATE UNIQUE INDEX "game_role_cards_assignment_identity_unique" ON "game_role_cards" USING btree ("id","game_id","campaign_id");
--> statement-breakpoint
CREATE TABLE "game_card_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_card_assignments_revision_valid" CHECK ("game_card_assignments"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "game_card_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_card_assignments" ADD CONSTRAINT "game_card_assignments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_card_assignments" ADD CONSTRAINT "game_card_assignments_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_card_assignments" ADD CONSTRAINT "game_card_assignments_card_fk" FOREIGN KEY ("card_id","game_id","campaign_id") REFERENCES "public"."game_role_cards"("id","game_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_card_assignments_game_profile_unique" ON "game_card_assignments" USING btree ("game_id","profile_id");--> statement-breakpoint
CREATE INDEX "game_card_assignments_profile_index" ON "game_card_assignments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "game_card_assignments_card_index" ON "game_card_assignments" USING btree ("card_id");--> statement-breakpoint

-- Server-only access, matching the existing repository security boundary.
REVOKE ALL ON public.game_card_assignments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_card_assignments TO service_role;
--> statement-breakpoint
-- Narrow exact-email lookup. No auth.users catalogue is exposed to the browser.
CREATE FUNCTION public.find_registered_profile_by_email(input_email text)
RETURNS TABLE(profile_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM auth.users u JOIN public.profiles p ON p.id=u.id
  WHERE lower(u.email)=lower(btrim(input_email)) LIMIT 2
$$;
REVOKE ALL ON FUNCTION public.find_registered_profile_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_registered_profile_by_email(text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_game_card_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_game uuid; target_campaign uuid; game_status text;
BEGIN
  target_game := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  SELECT campaign_id INTO target_campaign FROM public.games WHERE id=target_game;
  PERFORM 1 FROM public.campaigns WHERE id=target_campaign FOR UPDATE;
  SELECT status::text INTO game_status FROM public.games WHERE id=target_game FOR UPDATE;
  IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(target_game, ARRAY['delete']) THEN RETURN OLD; END IF;
  IF game_status IS NULL OR game_status NOT IN ('draft','ready','active','paused') THEN
    RAISE EXCEPTION 'Assignments are locked for this game';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.game_id<>OLD.game_id OR NEW.campaign_id<>OLD.campaign_id OR NEW.profile_id<>OLD.profile_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN
    RAISE EXCEPTION 'Assignment identity is immutable and revision must advance';
  END IF;
  IF TG_OP='INSERT' AND NEW.revision<>0 THEN RAISE EXCEPTION 'Initial assignment revision must be zero'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER game_card_assignments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_card_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_game_card_assignment();
