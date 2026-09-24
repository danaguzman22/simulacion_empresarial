CREATE TABLE "card_responsibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_responsibilities_label_valid" CHECK (length(trim("card_responsibilities"."label")) between 1 and 5000 and length("card_responsibilities"."normalized_label") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "card_responsibilities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "selected_responsibilities" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "ana" integer;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "vis" integer;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "neg" integer;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "ope" integer;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "ada" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "selected_responsibilities" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "ana" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "vis" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "neg" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "ope" integer;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "ada" integer;--> statement-breakpoint
ALTER TABLE "card_responsibilities" ADD CONSTRAINT "card_responsibilities_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_responsibilities_owner_label_unique" ON "card_responsibilities" USING btree ("owner_id","normalized_label");
--> statement-breakpoint
-- Existing free text is deliberately preserved, including historical frozen cards.
-- No backfill guesses list separators, role presets, or modifier values.
REVOKE ALL ON public.card_responsibilities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.card_responsibilities TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.card_responsibility_key(label text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT btrim(regexp_replace(translate(lower(regexp_replace(btrim(normalize(label,NFKC)), '\s+', ' ', 'g')),
 'áàäâéèëêíìïîóòöôúùüûÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛ','aaaaeeeeiiiioooouuuuaaaaeeeeiiiioooouuuu'), '[.!;:,]+$', ''));
$$;
REVOKE ALL ON FUNCTION public.card_responsibility_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_responsibility_key(text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_card_responsibility_catalogue() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'RESPONSIBILITY_CATALOGUE_IMMUTABLE'; END IF;
 NEW.normalized_label := public.card_responsibility_key(NEW.label);
 RETURN NEW;
END; $$;
CREATE TRIGGER card_responsibilities_guard BEFORE INSERT OR UPDATE OR DELETE ON public.card_responsibilities
 FOR EACH ROW EXECUTE FUNCTION public.guard_card_responsibility_catalogue();
REVOKE ALL ON FUNCTION public.guard_card_responsibility_catalogue() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION public.guard_selected_responsibilities() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF cardinality(NEW.selected_responsibilities)>50
 OR (cardinality(NEW.selected_responsibilities)>0 AND array_ndims(NEW.selected_responsibilities)<>1)
 OR EXISTS(SELECT 1 FROM unnest(NEW.selected_responsibilities) AS r(label)
   WHERE label IS NULL OR length(label)>5000 OR public.card_responsibility_key(label)='')
 OR (SELECT count(*)<>count(DISTINCT public.card_responsibility_key(label)) FROM unnest(NEW.selected_responsibilities) AS r(label))
 THEN RAISE EXCEPTION 'CARD_RESPONSIBILITIES_INVALID'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER campaign_role_cards_responsibilities_guard BEFORE INSERT OR UPDATE ON public.campaign_role_cards
 FOR EACH ROW EXECUTE FUNCTION public.guard_selected_responsibilities();
CREATE TRIGGER game_role_cards_responsibilities_guard BEFORE INSERT OR UPDATE ON public.game_role_cards
 FOR EACH ROW EXECUTE FUNCTION public.guard_selected_responsibilities();
REVOKE ALL ON FUNCTION public.guard_selected_responsibilities() FROM PUBLIC, anon, authenticated;
