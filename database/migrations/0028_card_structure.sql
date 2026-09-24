CREATE TABLE "card_modifier_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_modifier_definitions_valid" CHECK (length(trim("card_modifier_definitions"."name")) between 1 and 160 and length("card_modifier_definitions"."normalized_name") between 1 and 160 and "card_modifier_definitions"."abbreviation" ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$')
);
--> statement-breakpoint
ALTER TABLE "card_modifier_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "configured_modifiers" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "abilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "private_information" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "individual_objective" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD COLUMN "secret_objective" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "configured_modifiers" jsonb;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "abilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "card_modifier_definitions" ADD CONSTRAINT "card_modifier_definitions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_modifier_definitions_owner_name_unique" ON "card_modifier_definitions" USING btree ("owner_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "card_modifier_definitions_owner_abbreviation_unique" ON "card_modifier_definitions" USING btree ("owner_id","abbreviation");
--> statement-breakpoint
-- Forward only: no updates/backfill of 0027 values or historical card definitions.
REVOKE ALL ON public.card_modifier_definitions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.card_modifier_definitions TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_card_modifier_catalogue() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CARD_MODIFIER_CATALOGUE_IMMUTABLE'; END IF;
 NEW.normalized_name:=public.card_responsibility_key(NEW.name);
 NEW.abbreviation:=upper(btrim(NEW.abbreviation));
 IF NEW.abbreviation IN ('ANA','VIS','NEG','OPE','ADA') OR NEW.normalized_name IN ('analisis','vision sistemica','negociacion','operaciones','adaptabilidad') THEN RAISE EXCEPTION 'CARD_MODIFIER_BUILTIN'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER card_modifier_definitions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.card_modifier_definitions FOR EACH ROW EXECUTE FUNCTION public.guard_card_modifier_catalogue();
REVOKE ALL ON FUNCTION public.guard_card_modifier_catalogue() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.validate_card_structure_list(items jsonb,kind text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; field text;
BEGIN
 IF items IS NULL THEN RETURN kind='modifiers'; END IF;
 IF jsonb_typeof(items)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(items)>50 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
  IF kind='modifiers' THEN
   IF jsonb_typeof(item->'key') IS DISTINCT FROM 'string' OR (item->>'key' NOT IN ('ana','vis','neg','ope','ada') AND item->>'key' !~ '^custom:[0-9a-fA-F-]{36}$')
    OR jsonb_typeof(item->'abbreviation') IS DISTINCT FROM 'string' OR length(btrim(item->>'abbreviation')) NOT BETWEEN 1 AND 16
    OR jsonb_typeof(item->'value') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
   IF (item->>'value')::numeric<>trunc((item->>'value')::numeric) OR (item->>'value')::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN RETURN false; END IF;
  ELSE
   FOREACH field IN ARRAY ARRAY['description','condition'] LOOP
    IF jsonb_typeof(item->field) IS DISTINCT FROM 'string' OR length(item->>field)>5000 THEN RETURN false; END IF;
   END LOOP;
   IF kind IN ('abilities','restrictions') AND length(btrim(item->>'description'))=0 THEN RETURN false; END IF;
   IF kind='abilities' THEN
    IF NOT (item ?& ARRAY['type','useLimit','useScope']) OR item->>'type' NOT IN ('active','passive','support','interruption','revelation') OR jsonb_typeof(item->'type')<>'string' THEN RETURN false; END IF;
    IF item->'useLimit'='null'::jsonb THEN
     IF item->'useScope'<>'null'::jsonb THEN RETURN false; END IF;
    ELSE
     IF jsonb_typeof(item->'useLimit') IS DISTINCT FROM 'number' OR item->>'useScope' IS NULL OR item->>'useScope' NOT IN ('round','game') THEN RETURN false; END IF;
     IF (item->>'useLimit')::numeric<>trunc((item->>'useLimit')::numeric) OR (item->>'useLimit')::numeric NOT BETWEEN 1 AND 2147483647 THEN RETURN false; END IF;
    END IF;
   ELSIF kind='weaknesses' THEN
    IF jsonb_typeof(item->'consequence') IS DISTINCT FROM 'string' OR length(btrim(item->>'consequence')) NOT BETWEEN 1 AND 5000 THEN RETURN false; END IF;
   ELSIF kind='restrictions' THEN
    IF jsonb_typeof(item->'visibility') IS DISTINCT FROM 'string' OR item->>'visibility' NOT IN ('public','private') THEN RETURN false; END IF;
   ELSE RETURN false;
   END IF;
  END IF;
 END LOOP;
 IF kind='modifiers' AND (EXISTS(SELECT 1 FROM jsonb_array_elements(items) m GROUP BY m->>'key' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) m GROUP BY upper(m->>'abbreviation') HAVING count(*)>1)) THEN RETURN false; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.validate_card_structure_list(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_card_structure_list(jsonb,text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_card_structure() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT public.validate_card_structure_list(NEW.configured_modifiers,'modifiers')
 OR NOT public.validate_card_structure_list(NEW.abilities,'abilities')
 OR NOT public.validate_card_structure_list(NEW.weaknesses,'weaknesses')
 OR NOT public.validate_card_structure_list(NEW.restrictions,'restrictions')
 OR length(NEW.private_information)>5000 OR length(NEW.individual_objective)>5000 OR length(NEW.secret_objective)>5000
 THEN RAISE EXCEPTION 'CARD_STRUCTURE_INVALID'; END IF;
 RETURN NEW;
END; $$;
-- Existing guard_role_card continues enforcing preparation-only writes and revisions.
CREATE TRIGGER campaign_role_cards_structure_guard BEFORE INSERT OR UPDATE ON public.campaign_role_cards FOR EACH ROW EXECUTE FUNCTION public.guard_card_structure();
CREATE TRIGGER game_role_cards_structure_guard BEFORE INSERT OR UPDATE ON public.game_role_cards FOR EACH ROW EXECUTE FUNCTION public.guard_card_structure();
REVOKE ALL ON FUNCTION public.guard_card_structure() FROM PUBLIC,anon,authenticated;
