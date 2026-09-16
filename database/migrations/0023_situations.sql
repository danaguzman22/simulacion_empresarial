-- 0023: additive situations; no functional backfill of existing executions.
CREATE TABLE "game_situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"state_set_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"previous_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"effect_count" integer NOT NULL,
	"visibility" text DEFAULT 'display' NOT NULL,
	"transaction_id" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_situations_text_valid" CHECK (length(trim("game_situations"."title")) between 1 and 160 and length("game_situations"."description") <= 5000),
	CONSTRAINT "game_situations_visibility_valid" CHECK ("game_situations"."visibility" in ('display','master_only')),
	CONSTRAINT "game_situations_revision_valid" CHECK ("game_situations"."previous_revision" >= 0 and "game_situations"."effect_count" between 0 and 100 and "game_situations"."revision" = "game_situations"."previous_revision" + case when "game_situations"."effect_count" > 0 then 1 else 0 end)
);
--> statement-breakpoint
ALTER TABLE "game_situations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "game_kpi_changes_state_revision_unique";--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD COLUMN "situation_id" uuid;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD COLUMN "effect_type" text;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD COLUMN "amount" numeric;--> statement-breakpoint
ALTER TABLE "game_situations" ADD CONSTRAINT "game_situations_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_situations" ADD CONSTRAINT "game_situations_game_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_situations" ADD CONSTRAINT "game_situations_round_fk" FOREIGN KEY ("round_id","game_id","campaign_id") REFERENCES "public"."rounds"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_situations" ADD CONSTRAINT "game_situations_state_fk" FOREIGN KEY ("state_set_id","game_id","campaign_id") REFERENCES "public"."game_state_sets"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_situations_operation_unique" ON "game_situations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "game_situations_game_time_idx" ON "game_situations" USING btree ("game_id","published_at");--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD CONSTRAINT "game_kpi_changes_situation_id_game_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."game_situations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_kpi_changes_situation_kpi_unique" ON "game_kpi_changes" USING btree ("situation_id","kpi_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_kpi_changes_state_revision_unique" ON "game_kpi_changes" USING btree ("state_set_id","revision","kpi_definition_id");--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD CONSTRAINT "game_kpi_changes_source_valid" CHECK (("game_kpi_changes"."source"='manual' and "game_kpi_changes"."situation_id" is null and "game_kpi_changes"."effect_type" is null and "game_kpi_changes"."amount" is null) or ("game_kpi_changes"."source"='situation' and "game_kpi_changes"."situation_id" is not null and "game_kpi_changes"."effect_type"='numeric_add' and "game_kpi_changes"."amount" is not null and "game_kpi_changes"."amount"::text not in ('NaN','Infinity','-Infinity')));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_kpi_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset','delete']) THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Game KPI audit is immutable';
  END IF;

  IF NEW.source = 'situation' THEN
    IF NOT EXISTS(SELECT 1 FROM public.game_situations s
      JOIN public.game_state_sets st ON st.id=s.state_set_id
      JOIN public.kpi_definitions k ON k.id=NEW.kpi_definition_id
      JOIN public.game_state_values v ON v.state_set_id=st.id AND v.kpi_definition_id=k.id
      WHERE s.id=NEW.situation_id AND s.game_id=NEW.game_id AND s.campaign_id=NEW.campaign_id
      AND s.round_id=NEW.round_id AND s.state_set_id=NEW.state_set_id AND s.actor_id=NEW.actor_id
      AND s.transaction_id=pg_current_xact_id()::text AND s.revision=NEW.revision
      AND st.revision=NEW.revision AND st.updated_by=NEW.actor_id AND st.phase='current' AND st.frozen_at IS NULL
      AND k.value_type='numeric' AND NEW.effect_type='numeric_add' AND NEW.operation='update'
      AND NEW.amount=round(NEW.amount,k.precision) AND abs(NEW.amount)<1000000000000000000000000::numeric
      AND (NEW.before->>'value')::numeric + NEW.amount = (NEW.after->>'value')::numeric
      AND (NEW.after->>'value')::numeric=v.value
      AND NEW.before->>'ordinalKey' IS NULL AND NEW.after->>'ordinalKey' IS NULL)
    THEN RAISE EXCEPTION 'Invalid situation effect audit'; END IF;
    NEW.transaction_id:=pg_current_xact_id()::text; NEW.created_at:=clock_timestamp(); RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM public.game_kpi_changes c WHERE c.state_set_id=NEW.state_set_id AND c.revision=NEW.revision)
     OR EXISTS(SELECT 1 FROM public.game_situations s WHERE s.state_set_id=NEW.state_set_id AND s.revision=NEW.revision AND s.effect_count>0)
  THEN RAISE EXCEPTION 'Current revision already belongs to another event'; END IF;
  IF NEW.operation <> 'update' THEN
    RAISE EXCEPTION 'Invalid game KPI audit operation';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.games
      WHERE id = NEW.game_id
        AND campaign_id = NEW.campaign_id
        AND status = 'active'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.rounds
      WHERE id = NEW.round_id
        AND game_id = NEW.game_id
        AND campaign_id = NEW.campaign_id
        AND status IN ('active','paused')
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.game_state_sets
      WHERE id = NEW.state_set_id
        AND game_id = NEW.game_id
        AND campaign_id = NEW.campaign_id
        AND phase = 'current'
        AND revision = NEW.revision
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.game_kpis
      WHERE game_id = NEW.game_id
        AND kpi_definition_id = NEW.kpi_definition_id
        AND campaign_id = NEW.campaign_id
    ) THEN
    RAISE EXCEPTION 'Invalid operational KPI audit context';
  END IF;

  NEW.transaction_id := pg_current_xact_id()::text;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION public.guard_game_situation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE st public.game_state_sets%ROWTYPE; r public.rounds%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset','delete']) THEN RETURN OLD; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Published situations are immutable'; END IF;
 PERFORM 1 FROM public.campaigns WHERE id=NEW.campaign_id FOR UPDATE;
 PERFORM 1 FROM public.games WHERE id=NEW.game_id AND campaign_id=NEW.campaign_id AND status IN ('active','paused') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Situation requires an active or paused game'; END IF;
 PERFORM 1 FROM public.campaign_members WHERE campaign_id=NEW.campaign_id AND profile_id=NEW.actor_id AND role='master' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only Master can publish situations'; END IF;
 SELECT * INTO st FROM public.game_state_sets WHERE id=NEW.state_set_id AND game_id=NEW.game_id AND campaign_id=NEW.campaign_id FOR UPDATE;
 IF NOT FOUND OR st.phase<>'current' OR st.frozen_at IS NOT NULL OR st.revision<>NEW.previous_revision THEN RAISE EXCEPTION 'Stale or invalid situation current state'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=NEW.round_id AND game_id=NEW.game_id AND campaign_id=NEW.campaign_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('active','paused') OR (r.status='active' AND (r.ends_at IS NULL OR r.ends_at<=clock_timestamp())) THEN RAISE EXCEPTION 'Situation requires the current unexpired round'; END IF;
 NEW.transaction_id:=pg_current_xact_id()::text; NEW.published_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER game_situations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_situations FOR EACH ROW EXECUTE FUNCTION public.guard_game_situation();
--> statement-breakpoint
CREATE FUNCTION public.check_situation_complete() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']) THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.game_kpi_changes WHERE situation_id=NEW.id)<>NEW.effect_count
 OR NOT EXISTS(SELECT 1 FROM public.game_state_sets WHERE id=NEW.state_set_id AND revision=NEW.revision)
 OR EXISTS(SELECT 1 FROM public.game_kpi_changes c WHERE c.state_set_id=NEW.state_set_id AND c.revision=NEW.revision AND NEW.effect_count>0 AND c.situation_id IS DISTINCT FROM NEW.id)
 THEN RAISE EXCEPTION 'Situation effects and current revision must commit atomically'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_situations_complete AFTER INSERT ON public.game_situations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_situation_complete();
--> statement-breakpoint
-- Verify every changed value against its own audit, including actual before/after.
CREATE OR REPLACE FUNCTION public.check_current_kpi_value_audited() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.game_state_sets%ROWTYPE; audit public.game_kpi_changes%ROWTYPE; target_id uuid; kpi_id uuid;
BEGIN
 IF public.lifecycle_mutation_allowed(CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END,ARRAY['reset','delete']) THEN RETURN NULL; END IF;
 target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.state_set_id ELSE NEW.state_set_id END;
 kpi_id:=CASE WHEN TG_OP='DELETE' THEN OLD.kpi_definition_id ELSE NEW.kpi_definition_id END;
 SELECT * INTO target FROM public.game_state_sets WHERE id=target_id;
 IF target.phase='current' AND NOT(TG_OP='INSERT' AND target.created_at=transaction_timestamp()) THEN
  SELECT * INTO audit FROM public.game_kpi_changes WHERE state_set_id=target_id AND revision=target.revision AND kpi_definition_id=kpi_id AND transaction_id=pg_current_xact_id()::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current KPI value change requires an audit record in the same transaction'; END IF;
  IF audit.source='situation' AND (TG_OP<>'UPDATE' OR OLD.ordinal_key IS NOT NULL OR NEW.ordinal_key IS NOT NULL
    OR (audit.before->>'value')::numeric IS DISTINCT FROM OLD.value OR (audit.after->>'value')::numeric IS DISTINCT FROM NEW.value)
  THEN RAISE EXCEPTION 'Situation effect does not match the actual value change'; END IF;
 END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
-- A fabricated effect without a value mutation must not become historical evidence.
CREATE FUNCTION public.check_situation_effect_applied() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source='situation' AND NOT COALESCE(public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']),false) AND NOT EXISTS(
   SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=NEW.state_set_id AND v.kpi_definition_id=NEW.kpi_definition_id
   AND v.xmin::text::bigint = mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND v.value=(NEW.after->>'value')::numeric)
 THEN RAISE EXCEPTION 'Situation effect requires a value write in the same transaction'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_situation_effect_applied AFTER INSERT ON public.game_kpi_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_situation_effect_applied();
--> statement-breakpoint
REVOKE ALL ON public.game_situations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON public.game_situations TO service_role;
REVOKE ALL ON FUNCTION public.guard_game_situation(),public.check_situation_complete(),public.check_situation_effect_applied() FROM PUBLIC,anon,authenticated;
