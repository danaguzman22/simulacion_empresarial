CREATE TABLE "game_kpis" (
	"game_id" uuid NOT NULL,
	"kpi_definition_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"historical_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_kpis" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "game_preparation_changes" DROP CONSTRAINT "game_preparation_changes_operation_valid";
--> statement-breakpoint
ALTER TABLE "game_state_values" ADD COLUMN "game_id" uuid;
--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD COLUMN "historical_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "game_kpis" ADD CONSTRAINT "game_kpis_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_kpis" ADD CONSTRAINT "game_kpis_game_campaign_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_kpis" ADD CONSTRAINT "game_kpis_definition_campaign_fk" FOREIGN KEY ("kpi_definition_id","campaign_id") REFERENCES "public"."kpi_definitions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "game_kpis_game_kpi_unique" ON "game_kpis" USING btree ("game_id","kpi_definition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "game_kpis_game_kpi_campaign_unique" ON "game_kpis" USING btree ("game_id","kpi_definition_id","campaign_id");
--> statement-breakpoint
CREATE INDEX "game_kpis_kpi_idx" ON "game_kpis" USING btree ("kpi_definition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "game_state_sets_id_game_campaign_unique" ON "game_state_sets" USING btree ("id","game_id","campaign_id");
--> statement-breakpoint
ALTER TABLE "game_preparation_changes" ADD CONSTRAINT "game_preparation_changes_operation_valid" CHECK ("game_preparation_changes"."operation" in ('save_values', 'copy_snapshot', 'create_kpi', 'add_kpi', 'remove_kpi', 'set_required', 'edit_kpi', 'delete_kpi'));
--> statement-breakpoint
-- Metadata-only backfill. Values and audit history are preserved under migration locks.
ALTER TABLE public.game_state_values DISABLE TRIGGER game_state_values_guard;
ALTER TABLE public.game_state_values DISABLE TRIGGER game_state_values_preparation_audited;
UPDATE public.game_state_values v SET game_id=s.game_id FROM public.game_state_sets s WHERE s.id=v.state_set_id;
ALTER TABLE public.game_state_values ENABLE TRIGGER game_state_values_guard;
ALTER TABLE public.game_state_values ENABLE TRIGGER game_state_values_preparation_audited;
ALTER TABLE public.game_state_values ALTER COLUMN game_id SET NOT NULL;
INSERT INTO public.game_kpis(game_id,kpi_definition_id,campaign_id,required,created_by)
SELECT DISTINCT s.game_id,d.id,s.campaign_id,d.required,d.created_by
FROM public.game_state_sets s JOIN public.kpi_definitions d ON d.campaign_id=s.campaign_id
WHERE (s.phase='preparation' AND d.active) OR EXISTS (
 SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=s.id AND v.kpi_definition_id=d.id
) ON CONFLICT (game_id,kpi_definition_id) DO NOTHING;
UPDATE public.game_kpis k SET historical_used_at=now() WHERE EXISTS (
 SELECT 1 FROM public.game_state_sets s WHERE s.game_id=k.game_id AND s.phase IN ('initial','current','final')
);
UPDATE public.kpi_definitions d SET historical_used_at=now() WHERE EXISTS (
 SELECT 1 FROM public.game_kpis k WHERE k.kpi_definition_id=d.id AND k.historical_used_at IS NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_state_game_campaign_fk" FOREIGN KEY ("state_set_id","game_id","campaign_id") REFERENCES "public"."game_state_sets"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_game_kpi_fk" FOREIGN KEY ("game_id","kpi_definition_id","campaign_id") REFERENCES "public"."game_kpis"("game_id","kpi_definition_id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON TABLE public.game_kpis FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.game_kpis TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_kpi_definition()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE semantic_change boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.historical_used_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.game_kpis WHERE kpi_definition_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.game_state_values WHERE kpi_definition_id=OLD.id) THEN
   RAISE EXCEPTION 'Remove editable game associations first; historical KPIs cannot be deleted';
  END IF;
  RETURN OLD;
 END IF;
 IF ROW(NEW.id,NEW.campaign_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.campaign_id,OLD.created_by,OLD.created_at)
 OR (OLD.historical_used_at IS NOT NULL AND NEW.historical_used_at IS DISTINCT FROM OLD.historical_used_at)
 OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at) THEN
  RAISE EXCEPTION 'KPI identity and usage markers are immutable';
 END IF;
 semantic_change := ROW(NEW.key,NEW.name,NEW.unit,NEW.precision,NEW.allows_negative) IS DISTINCT FROM ROW(OLD.key,OLD.name,OLD.unit,OLD.precision,OLD.allows_negative);
 IF semantic_change THEN
  IF OLD.historical_used_at IS NOT NULL OR EXISTS (
   SELECT 1 FROM public.game_kpis k JOIN public.games g ON g.id=k.game_id
   WHERE k.kpi_definition_id=OLD.id AND (k.historical_used_at IS NOT NULL OR g.status NOT IN ('draft','ready')
    OR EXISTS(SELECT 1 FROM public.game_state_sets s WHERE s.game_id=g.id AND (s.phase<>'preparation' OR s.frozen_at IS NOT NULL)))
  ) THEN RAISE EXCEPTION 'Historical or noneditable KPI meaning cannot change'; END IF;
  IF EXISTS(SELECT 1 FROM public.game_state_values v WHERE v.kpi_definition_id=OLD.id
    AND (v.value<>round(v.value,NEW.precision) OR (v.value<0 AND NOT NEW.allows_negative))) THEN
   RAISE EXCEPTION 'Existing preparation values are incompatible with precision or negative policy';
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_game_kpi()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; target_game uuid; target_kpi uuid;
BEGIN
 IF TG_OP='DELETE' THEN target_game:=OLD.game_id; target_kpi:=OLD.kpi_definition_id;
 ELSE target_game:=NEW.game_id; target_kpi:=NEW.kpi_definition_id; END IF;
 SELECT * INTO g FROM public.games WHERE id=target_game FOR UPDATE;
 PERFORM 1 FROM public.kpi_definitions WHERE id=target_kpi FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.game_id,NEW.kpi_definition_id,NEW.campaign_id,NEW.created_at,NEW.created_by) IS DISTINCT FROM ROW(OLD.game_id,OLD.kpi_definition_id,OLD.campaign_id,OLD.created_at,OLD.created_by)
   OR (OLD.historical_used_at IS NOT NULL AND NEW.historical_used_at IS DISTINCT FROM OLD.historical_used_at) THEN
   RAISE EXCEPTION 'Association identity and historical marker are immutable'; END IF;
  -- Internal historical stamping does not change the selection or requirement.
  IF NEW.required=OLD.required AND NEW.historical_used_at IS NOT DISTINCT FROM OLD.historical_used_at THEN RETURN NEW; END IF;
  IF NEW.required=OLD.required AND OLD.historical_used_at IS NULL AND NEW.historical_used_at IS NOT NULL THEN RETURN NEW; END IF;
 END IF;
 IF g.status NOT IN ('draft','ready') OR EXISTS(SELECT 1 FROM public.game_state_sets s WHERE s.game_id=target_game AND (s.phase<>'preparation' OR s.frozen_at IS NOT NULL))
 OR (TG_OP<>'INSERT' AND OLD.historical_used_at IS NOT NULL) THEN RAISE EXCEPTION 'Game KPI selection is no longer editable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_kpis_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_kpis FOR EACH ROW EXECUTE FUNCTION public.guard_game_kpi();
--> statement-breakpoint
CREATE FUNCTION public.stamp_game_kpi_history()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.phase IN ('initial','current','final') THEN
  UPDATE public.game_kpis SET historical_used_at=now() WHERE game_id=NEW.game_id AND historical_used_at IS NULL;
  UPDATE public.kpi_definitions SET historical_used_at=now() WHERE historical_used_at IS NULL AND id IN (SELECT kpi_definition_id FROM public.game_kpis WHERE game_id=NEW.game_id);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_state_sets_kpi_history AFTER INSERT ON public.game_state_sets FOR EACH ROW EXECUTE FUNCTION public.stamp_game_kpi_history();
--> statement-breakpoint
CREATE FUNCTION public.check_game_kpi_audited()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target_game uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.required=OLD.required THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN target_game:=OLD.game_id; ELSE target_game:=NEW.game_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.game_state_sets s JOIN public.game_preparation_changes c ON c.state_set_id=s.id AND c.revision=s.revision
  WHERE s.game_id=target_game AND s.phase='preparation' AND c.actor_id=s.updated_by AND c.transaction_id=pg_current_xact_id()::text) THEN
  RAISE EXCEPTION 'KPI selection changes require an audited preparation revision in the same transaction';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_kpis_audited AFTER INSERT OR UPDATE OR DELETE ON public.game_kpis DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_game_kpi_audited();
REVOKE ALL ON FUNCTION public.guard_game_kpi(),public.stamp_game_kpi_history(),public.check_game_kpi_audited() FROM PUBLIC,anon,authenticated;
