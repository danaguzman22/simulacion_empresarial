CREATE TABLE "campaign_role_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"public_information" text DEFAULT '' NOT NULL,
	"visual_identity" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_role_cards_valid" CHECK (length(trim("campaign_role_cards"."name")) between 1 and 160 and length("campaign_role_cards"."department")<=160 and length("campaign_role_cards"."visual_identity")<=160 and length("campaign_role_cards"."description")<=5000 and length("campaign_role_cards"."responsibilities")<=5000 and length("campaign_role_cards"."public_information")<=5000 and "campaign_role_cards"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_role_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_card_id" uuid NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"public_information" text DEFAULT '' NOT NULL,
	"visual_identity" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"private_information" text DEFAULT '' NOT NULL,
	"individual_objective" text DEFAULT '' NOT NULL,
	"secret_objective" text DEFAULT '' NOT NULL,
	CONSTRAINT "game_role_cards_valid" CHECK (length(trim("game_role_cards"."name")) between 1 and 160 and length("game_role_cards"."department")<=160 and length("game_role_cards"."visual_identity")<=160 and length("game_role_cards"."description")<=5000 and length("game_role_cards"."responsibilities")<=5000 and length("game_role_cards"."public_information")<=5000 and length("game_role_cards"."private_information")<=5000 and length("game_role_cards"."individual_objective")<=5000 and length("game_role_cards"."secret_objective")<=5000 and "game_role_cards"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "game_role_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD CONSTRAINT "campaign_role_cards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD CONSTRAINT "campaign_role_cards_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD CONSTRAINT "campaign_role_cards_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_game_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_role_cards_identity_unique" ON "campaign_role_cards" USING btree ("id","campaign_id");
--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_source_fk" FOREIGN KEY ("source_card_id","campaign_id") REFERENCES "public"."campaign_role_cards"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_role_cards_source_unique" ON "game_role_cards" USING btree ("game_id","source_card_id");
--> statement-breakpoint
-- Server/repository access only. No browser policies or direct authenticated grants.
REVOKE ALL ON public.campaign_role_cards, public.game_role_cards FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_role_cards, public.game_role_cards TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_role_card() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target_game uuid; game_status text;
BEGIN
 IF TG_TABLE_NAME='game_role_cards' THEN
  target_game := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  IF TG_OP='DELETE' AND COALESCE(public.lifecycle_mutation_allowed(target_game, ARRAY['delete']),false) THEN RETURN OLD; END IF;
  SELECT status::text INTO game_status FROM public.games WHERE id=target_game FOR UPDATE;
  IF game_status IS NULL OR game_status NOT IN ('draft','ready') OR EXISTS (
   SELECT 1 FROM public.game_state_sets WHERE game_id=target_game AND (phase<>'preparation' OR frozen_at IS NOT NULL)
  ) THEN RAISE EXCEPTION 'ROLE_CARD_FROZEN'; END IF;
  IF TG_OP='UPDATE' AND (NEW.game_id,NEW.source_card_id) IS DISTINCT FROM (OLD.game_id,OLD.source_card_id) THEN
   RAISE EXCEPTION 'ROLE_CARD_IDENTITY_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.campaign_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.campaign_id,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'ROLE_CARD_IDENTITY_IMMUTABLE'; END IF;
  IF NEW.revision <> OLD.revision+1 THEN RAISE EXCEPTION 'ROLE_CARD_REVISION_REQUIRED'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER campaign_role_cards_guard BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_role_cards FOR EACH ROW EXECUTE FUNCTION public.guard_role_card();
CREATE TRIGGER game_role_cards_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_role_cards FOR EACH ROW EXECUTE FUNCTION public.guard_role_card();
REVOKE ALL ON FUNCTION public.guard_role_card() FROM PUBLIC, anon, authenticated;
