CREATE TABLE "card_secret_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"discarded_at" timestamp with time zone,
	CONSTRAINT "card_secret_reveals_window_valid" CHECK ("card_secret_reveals"."expires_at" > "card_secret_reveals"."started_at" and ("card_secret_reveals"."discarded_at" is null or "card_secret_reveals"."discarded_at" >= "card_secret_reveals"."started_at"))
);
--> statement-breakpoint
ALTER TABLE "card_secret_reveals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "secret_reveal_limit" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "secret_reveal_seconds" integer;--> statement-breakpoint
ALTER TABLE "card_secret_reveals" ADD CONSTRAINT "card_secret_reveals_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_secret_reveals" ADD CONSTRAINT "card_secret_reveals_card_fk" FOREIGN KEY ("card_id","game_id","campaign_id") REFERENCES "public"."game_role_cards"("id","game_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_secret_reveals_operation_unique" ON "card_secret_reveals" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "card_secret_reveals_card_current_idx" ON "card_secret_reveals" USING btree ("card_id") WHERE "card_secret_reveals"."discarded_at" is null;--> statement-breakpoint
CREATE INDEX "card_secret_reveals_actor_current_idx" ON "card_secret_reveals" USING btree ("card_id","actor_id","expires_at") WHERE "card_secret_reveals"."discarded_at" is null;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_reveal_config_valid" CHECK (("game_role_cards"."secret_reveal_limit" is null and "game_role_cards"."secret_reveal_seconds" is null) or ("game_role_cards"."secret_reveal_limit" is not null and "game_role_cards"."secret_reveal_seconds" is not null and "game_role_cards"."secret_reveal_limit" between 0 and 100 and "game_role_cards"."secret_reveal_seconds" between 1 and 3600));
--> statement-breakpoint
-- No UPDATE/backfill: historical cards remain unconfigured. Defaults apply only
-- to newly inserted game cards; existing preparations can be explicitly saved.
CREATE FUNCTION public.default_card_secret_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.secret_reveal_limit := coalesce(NEW.secret_reveal_limit,2);
 NEW.secret_reveal_seconds := coalesce(NEW.secret_reveal_seconds,10);
 RETURN NEW;
END $$;
CREATE TRIGGER game_role_cards_secret_defaults BEFORE INSERT ON public.game_role_cards FOR EACH ROW EXECUTE FUNCTION public.default_card_secret_configuration();
--> statement-breakpoint
CREATE FUNCTION public.secret_reveal_execution_open(target_game uuid) RETURNS boolean LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.games g WHERE g.id=target_game AND g.status='active')
 AND NOT EXISTS(SELECT 1 FROM public.rounds r WHERE r.game_id=target_game AND r.status='active' AND r.ends_at<=clock_timestamp())
 AND NOT (EXISTS(SELECT 1 FROM public.rounds r WHERE r.game_id=target_game)
   AND NOT EXISTS(SELECT 1 FROM public.rounds r WHERE r.game_id=target_game AND r.status<>'completed'))
$$;
REVOKE ALL ON FUNCTION public.secret_reveal_execution_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.secret_reveal_execution_open(uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_card_secret_reveal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target_game uuid; target_campaign uuid; institution uuid; c public.game_role_cards%ROWTYPE; used bigint;
BEGIN
 target_game := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 IF TG_OP='DELETE' THEN
  IF coalesce(public.lifecycle_mutation_allowed(target_game,ARRAY['delete']),false) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Secret reveal history is immutable';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NOT coalesce(public.lifecycle_mutation_allowed(target_game,ARRAY['reset']),false)
   OR OLD.discarded_at IS NOT NULL OR NEW.discarded_at IS NULL
   OR (to_jsonb(NEW)-'discarded_at') IS DISTINCT FROM (to_jsonb(OLD)-'discarded_at') THEN
   RAISE EXCEPTION 'Only audited Reset can discard secret reveals';
  END IF;
  NEW.discarded_at := clock_timestamp(); RETURN NEW;
 END IF;
 SELECT campaign_id INTO target_campaign FROM public.games WHERE id=target_game;
 PERFORM 1 FROM public.campaigns WHERE id=target_campaign FOR UPDATE;
 PERFORM 1 FROM public.games WHERE id=target_game FOR UPDATE;
 SELECT co.institution_id INTO institution FROM public.companies co JOIN public.campaigns ca ON ca.company_id=co.id WHERE ca.id=target_campaign FOR SHARE OF co;
 IF institution IS NOT NULL THEN
  PERFORM 1 FROM public.institution_members WHERE institution_id=institution AND profile_id=NEW.actor_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Institutional membership required'; END IF;
 END IF;
 PERFORM 1 FROM public.game_card_assignments WHERE game_id=target_game AND campaign_id=target_campaign AND card_id=NEW.card_id AND profile_id=NEW.actor_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current card assignment required'; END IF;
 SELECT * INTO c FROM public.game_role_cards WHERE id=NEW.card_id AND game_id=target_game AND campaign_id=target_campaign FOR UPDATE;
 IF NOT FOUND OR NEW.campaign_id IS DISTINCT FROM target_campaign OR NEW.discarded_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid secret reveal identity'; END IF;
 IF NOT public.secret_reveal_execution_open(target_game) THEN RAISE EXCEPTION 'Game is not open for secret reveals'; END IF;
 IF c.secret_reveal_limit IS NULL OR c.secret_reveal_seconds IS NULL OR length(trim(c.secret_objective))=0 THEN RAISE EXCEPTION 'Secret reveal is not configured'; END IF;
 SELECT count(*) INTO used FROM public.card_secret_reveals WHERE card_id=c.id AND discarded_at IS NULL;
 IF used>=c.secret_reveal_limit THEN RAISE EXCEPTION 'Shared secret reveal quota exhausted'; END IF;
 IF EXISTS(SELECT 1 FROM public.card_secret_reveals WHERE card_id=c.id AND actor_id=NEW.actor_id AND discarded_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Actor already has an open reveal'; END IF;
 NEW.started_at := clock_timestamp();
 NEW.expires_at := NEW.started_at + make_interval(secs=>c.secret_reveal_seconds);
 RETURN NEW;
END $$;
CREATE TRIGGER card_secret_reveals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.card_secret_reveals FOR EACH ROW EXECUTE FUNCTION public.guard_card_secret_reveal();
REVOKE ALL ON FUNCTION public.guard_card_secret_reveal(), public.default_card_secret_configuration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.card_secret_reveals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_secret_reveals TO service_role;
