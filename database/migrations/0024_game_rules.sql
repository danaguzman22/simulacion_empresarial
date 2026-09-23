CREATE TABLE "game_rule_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kpi_definition_id" uuid NOT NULL,
	"effect_type" text DEFAULT 'numeric_add' NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "game_rule_effects_valid" CHECK ("game_rule_effects"."effect_type"='numeric_add' and "game_rule_effects"."amount"::text not in ('NaN','Infinity','-Infinity') and abs("game_rule_effects"."amount")<1000000000000000000000000::numeric)
);
--> statement-breakpoint
ALTER TABLE "game_rule_effects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_rule_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"state_set_id" uuid NOT NULL,
	"close_operation_id" uuid NOT NULL,
	"previous_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"effect_count" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transaction_id" text DEFAULT pg_current_xact_id()::text NOT NULL,
	CONSTRAINT "game_rule_executions_valid" CHECK ("game_rule_executions"."previous_revision">=0 and "game_rule_executions"."revision"="game_rule_executions"."previous_revision"+1 and "game_rule_executions"."effect_count">0 and (("game_rule_executions"."reason"='timer' and "game_rule_executions"."actor_id" is null) or ("game_rule_executions"."reason"='manual' and "game_rule_executions"."actor_id" is not null)))
);
--> statement-breakpoint
ALTER TABLE "game_rule_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"trigger_type" text DEFAULT 'round_end' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'display' NOT NULL,
	"display_message" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_rules_valid" CHECK (length(trim("game_rules"."name")) between 1 and 160 and length("game_rules"."description")<=5000 and length("game_rules"."display_message")<=5000 and "game_rules"."trigger_type"='round_end' and "game_rules"."visibility" in ('display','master_only') and "game_rules"."position">=0 and "game_rules"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "game_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" DROP CONSTRAINT "game_kpi_changes_source_valid";--> statement-breakpoint
ALTER TABLE "game_state_sets" ALTER COLUMN "updated_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD COLUMN "rule_execution_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "game_rules_identity_unique" ON "game_rules" USING btree ("id","game_id","campaign_id");
--> statement-breakpoint
ALTER TABLE "game_rule_effects" ADD CONSTRAINT "game_rule_effects_rule_fk" FOREIGN KEY ("rule_id","game_id","campaign_id") REFERENCES "public"."game_rules"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rule_effects" ADD CONSTRAINT "game_rule_effects_kpi_fk" FOREIGN KEY ("game_id","kpi_definition_id","campaign_id") REFERENCES "public"."game_kpis"("game_id","kpi_definition_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rule_executions" ADD CONSTRAINT "game_rule_executions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rule_executions" ADD CONSTRAINT "game_rule_executions_rule_fk" FOREIGN KEY ("rule_id","game_id","campaign_id") REFERENCES "public"."game_rules"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rule_executions" ADD CONSTRAINT "game_rule_executions_round_fk" FOREIGN KEY ("round_id","game_id","campaign_id") REFERENCES "public"."rounds"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rule_executions" ADD CONSTRAINT "game_rule_executions_state_fk" FOREIGN KEY ("state_set_id","game_id","campaign_id") REFERENCES "public"."game_state_sets"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rules" ADD CONSTRAINT "game_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rules" ADD CONSTRAINT "game_rules_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rules" ADD CONSTRAINT "game_rules_game_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_rule_effects_kpi_unique" ON "game_rule_effects" USING btree ("rule_id","kpi_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_rule_executions_round_unique" ON "game_rule_executions" USING btree ("rule_id","round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_rule_executions_revision_unique" ON "game_rule_executions" USING btree ("state_set_id","revision");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD CONSTRAINT "game_kpi_changes_rule_execution_id_game_rule_executions_id_fk" FOREIGN KEY ("rule_execution_id") REFERENCES "public"."game_rule_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_kpi_changes_rule_kpi_unique" ON "game_kpi_changes" USING btree ("rule_execution_id","kpi_definition_id");--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_author_valid" CHECK ("game_state_sets"."updated_by" is not null or "game_state_sets"."phase"='current');--> statement-breakpoint
ALTER TABLE "game_kpi_changes" ADD CONSTRAINT "game_kpi_changes_source_valid" CHECK (("game_kpi_changes"."source"='manual' and "game_kpi_changes"."actor_id" is not null and "game_kpi_changes"."rule_execution_id" is null and "game_kpi_changes"."situation_id" is null and "game_kpi_changes"."effect_type" is null and "game_kpi_changes"."amount" is null) or ("game_kpi_changes"."source"='situation' and "game_kpi_changes"."actor_id" is not null and "game_kpi_changes"."rule_execution_id" is null and "game_kpi_changes"."situation_id" is not null and "game_kpi_changes"."effect_type"='numeric_add' and "game_kpi_changes"."amount" is not null and "game_kpi_changes"."amount"::text not in ('NaN','Infinity','-Infinity')) or ("game_kpi_changes"."source"='rule' and "game_kpi_changes"."rule_execution_id" is not null and "game_kpi_changes"."situation_id" is null and "game_kpi_changes"."effect_type" is not null and "game_kpi_changes"."effect_type"='numeric_add' and "game_kpi_changes"."amount" is not null and "game_kpi_changes"."amount"::text not in ('NaN','Infinity','-Infinity')));
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

  IF NEW.source='rule' THEN
    IF NOT EXISTS(SELECT 1 FROM public.game_rule_executions e JOIN public.game_rule_effects f ON f.rule_id=e.rule_id AND f.kpi_definition_id=NEW.kpi_definition_id
      JOIN public.game_state_sets st ON st.id=e.state_set_id JOIN public.game_state_values v ON v.state_set_id=st.id AND v.kpi_definition_id=f.kpi_definition_id
      WHERE e.id=NEW.rule_execution_id AND e.game_id=NEW.game_id AND e.campaign_id=NEW.campaign_id AND e.round_id=NEW.round_id AND e.state_set_id=NEW.state_set_id
      AND e.actor_id IS NOT DISTINCT FROM NEW.actor_id AND e.revision=NEW.revision AND st.revision=NEW.revision AND st.updated_by IS NOT DISTINCT FROM NEW.actor_id
      AND st.phase='current' AND st.frozen_at IS NULL AND e.transaction_id=pg_current_xact_id()::text
      AND NEW.operation='update' AND NEW.effect_type='numeric_add' AND NEW.amount=f.amount
      AND (NEW.before->>'value')::numeric+NEW.amount=(NEW.after->>'value')::numeric AND v.value=(NEW.after->>'value')::numeric
      AND NEW.before->>'ordinalKey' IS NULL AND NEW.after->>'ordinalKey' IS NULL)
    THEN RAISE EXCEPTION 'Invalid rule effect audit'; END IF;
    NEW.transaction_id:=pg_current_xact_id()::text;NEW.created_at:=clock_timestamp();RETURN NEW;
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
  IF audit.source IN ('situation','rule') AND (TG_OP<>'UPDATE' OR OLD.ordinal_key IS NOT NULL OR NEW.ordinal_key IS NOT NULL
    OR (audit.before->>'value')::numeric IS DISTINCT FROM OLD.value OR (audit.after->>'value')::numeric IS DISTINCT FROM NEW.value)
  THEN RAISE EXCEPTION 'Situation effect does not match the actual value change'; END IF;
 END IF;
 RETURN NULL;
END; $$;

--> statement-breakpoint
CREATE FUNCTION public.check_rule_effect_applied() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source='rule' AND NOT COALESCE(public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']),false) AND NOT EXISTS(
   SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=NEW.state_set_id AND v.kpi_definition_id=NEW.kpi_definition_id
   AND v.xmin::text::bigint = mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND v.value=(NEW.after->>'value')::numeric)
 THEN RAISE EXCEPTION 'Situation effect requires a value write in the same transaction'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_rule_effect_applied AFTER INSERT ON public.game_kpi_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_effect_applied();

--> statement-breakpoint
CREATE FUNCTION public.guard_rule_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE gid uuid; cid uuid; actor uuid; r public.game_rules%ROWTYPE; k public.kpi_definitions%ROWTYPE;
BEGIN
 gid:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 cid:=CASE WHEN TG_OP='DELETE' THEN OLD.campaign_id ELSE NEW.campaign_id END;
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(gid,ARRAY['delete']) THEN RETURN OLD; END IF;
 actor:=nullif(current_setting('nexus.rule_actor',true),'')::uuid;
 PERFORM 1 FROM public.campaigns WHERE id=cid FOR UPDATE;
 PERFORM 1 FROM public.games g JOIN public.game_state_sets s ON s.game_id=g.id AND s.phase='preparation'
 WHERE g.id=gid AND g.campaign_id=cid AND g.status IN ('draft','ready') AND s.frozen_at IS NULL FOR UPDATE OF g,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules are editable only in preparation'; END IF;
 PERFORM 1 FROM public.campaign_members WHERE campaign_id=cid AND profile_id=actor AND role='master' FOR SHARE;
 IF NOT FOUND THEN
  -- Co-Master may use the existing successor flow, but only copy exact definitions.
  SELECT source.* INTO r FROM public.game_rules source JOIN public.game_lifecycle_changes c ON c.details->>'previousGameId'=source.game_id::text
   JOIN public.campaign_members m ON m.campaign_id=cid AND m.profile_id=actor AND m.role='co_master'
   WHERE source.id=nullif(current_setting('nexus.rule_copy_id',true),'')::uuid AND source.campaign_id=cid
   AND c.game_id=gid AND c.actor_id=actor AND c.operation='create_from_previous' AND c.transaction_id=pg_current_xact_id()::text;
  IF NOT FOUND OR TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Only Master configures rules'; END IF;
  IF TG_TABLE_NAME='game_rules' THEN
   IF ROW(NEW.name,NEW.description,NEW.trigger_type,NEW.enabled,NEW.position,NEW.visibility,NEW.display_message) IS DISTINCT FROM ROW(r.name,r.description,r.trigger_type,r.enabled,r.position,r.visibility,r.display_message) THEN RAISE EXCEPTION 'Successor must copy exact rules'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.game_rule_effects WHERE rule_id=r.id AND kpi_definition_id=NEW.kpi_definition_id AND amount=NEW.amount AND effect_type=NEW.effect_type) THEN RAISE EXCEPTION 'Successor must copy exact effects'; END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.game_id,NEW.campaign_id) IS DISTINCT FROM ROW(OLD.id,OLD.game_id,OLD.campaign_id) THEN RAISE EXCEPTION 'Rule identity is immutable'; END IF;
 IF TG_TABLE_NAME='game_rules' AND TG_OP<>'DELETE' THEN
  IF NEW.updated_by<>actor OR (TG_OP='INSERT' AND (NEW.created_by<>actor OR NEW.revision<>0)) THEN RAISE EXCEPTION 'Invalid rule author/revision'; END IF;
  IF TG_OP='UPDATE' AND (NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Stale rule revision'; END IF;
  NEW.updated_at:=clock_timestamp();
 ELSIF TG_TABLE_NAME='game_rule_effects' AND TG_OP<>'DELETE' THEN
  SELECT * INTO k FROM public.kpi_definitions WHERE id=NEW.kpi_definition_id AND campaign_id=cid;
  IF NOT FOUND OR k.value_type<>'numeric' OR NEW.amount<>round(NEW.amount,k.precision) THEN RAISE EXCEPTION 'Invalid numeric rule effect'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER game_rules_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_rules FOR EACH ROW EXECUTE FUNCTION public.guard_rule_configuration();
CREATE TRIGGER game_rule_effects_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_rule_effects FOR EACH ROW EXECUTE FUNCTION public.guard_rule_configuration();
--> statement-breakpoint
CREATE FUNCTION public.check_rule_definition() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF TG_TABLE_NAME='game_rules' THEN rid:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSE rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rule_id ELSE NEW.rule_id END; END IF;
 IF EXISTS(SELECT 1 FROM public.game_rules r WHERE r.id=rid AND r.enabled AND NOT EXISTS(SELECT 1 FROM public.game_rule_effects WHERE rule_id=r.id)) THEN RAISE EXCEPTION 'Enabled rule requires effects'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_rules_complete AFTER INSERT OR UPDATE ON public.game_rules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_definition();
CREATE CONSTRAINT TRIGGER game_rule_effects_complete AFTER INSERT OR UPDATE OR DELETE ON public.game_rule_effects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_definition();
--> statement-breakpoint
CREATE FUNCTION public.guard_rule_execution() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE st public.game_state_sets%ROWTYPE; r public.rounds%ROWTYPE; definition public.game_rules%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset','delete']) THEN RETURN OLD; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Rule execution is immutable'; END IF;
 PERFORM 1 FROM public.campaigns WHERE id=NEW.campaign_id FOR UPDATE;
 PERFORM 1 FROM public.games WHERE id=NEW.game_id AND campaign_id=NEW.campaign_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid rule execution game'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=NEW.round_id AND game_id=NEW.game_id AND campaign_id=NEW.campaign_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('active','paused') THEN RAISE EXCEPTION 'Invalid rule execution round'; END IF;
 IF NEW.reason='timer' THEN
  IF NEW.actor_id IS NOT NULL OR r.status<>'active' OR r.ends_at>clock_timestamp() THEN RAISE EXCEPTION 'Invalid timer rule execution'; END IF;
 ELSE
  IF NEW.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id=NEW.campaign_id AND profile_id=NEW.actor_id AND role IN ('master','co_master')) THEN RAISE EXCEPTION 'Invalid manual close actor'; END IF;
 END IF;
 SELECT * INTO st FROM public.game_state_sets WHERE id=NEW.state_set_id AND game_id=NEW.game_id AND campaign_id=NEW.campaign_id FOR UPDATE;
 IF NOT FOUND OR st.phase<>'current' OR st.frozen_at IS NOT NULL OR st.revision<>NEW.previous_revision THEN RAISE EXCEPTION 'Invalid rule execution revision'; END IF;
 SELECT * INTO definition FROM public.game_rules WHERE id=NEW.rule_id AND game_id=NEW.game_id AND campaign_id=NEW.campaign_id AND enabled AND trigger_type='round_end';
 IF NOT FOUND OR NEW.effect_count<>(SELECT count(*) FROM public.game_rule_effects WHERE rule_id=definition.id) THEN RAISE EXCEPTION 'Invalid rule execution definition'; END IF;
 IF EXISTS(SELECT 1 FROM public.game_rules p WHERE p.game_id=NEW.game_id AND p.enabled AND (p.position,p.id)<(definition.position,definition.id) AND NOT EXISTS(SELECT 1 FROM public.game_rule_executions e WHERE e.rule_id=p.id AND e.round_id=NEW.round_id AND e.close_operation_id=NEW.close_operation_id AND e.transaction_id=pg_current_xact_id()::text)) THEN RAISE EXCEPTION 'Rules must execute in order'; END IF;
 NEW.transaction_id:=pg_current_xact_id()::text;NEW.executed_at:=clock_timestamp();RETURN NEW;
END; $$;
CREATE TRIGGER game_rule_executions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_rule_executions FOR EACH ROW EXECUTE FUNCTION public.guard_rule_execution();
--> statement-breakpoint
CREATE FUNCTION public.check_rule_execution_complete() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.round_changes c JOIN public.rounds r ON r.id=c.round_id
   WHERE c.operation_id=NEW.close_operation_id AND c.operation='finish' AND c.round_id=NEW.round_id AND c.game_id=NEW.game_id AND c.campaign_id=NEW.campaign_id
   AND c.actor_id IS NOT DISTINCT FROM NEW.actor_id AND c.details->>'reason'=NEW.reason AND c.transaction_id=NEW.transaction_id AND r.status='completed')
 OR (SELECT count(*) FROM public.game_kpi_changes WHERE rule_execution_id=NEW.id AND transaction_id=NEW.transaction_id AND revision=NEW.revision)<>NEW.effect_count
 OR NOT EXISTS(SELECT 1 FROM public.game_state_sets WHERE id=NEW.state_set_id AND revision>=NEW.revision)
 THEN RAISE EXCEPTION 'Rule execution must commit with all effects and round close'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_rule_executions_complete AFTER INSERT ON public.game_rule_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_execution_complete();
--> statement-breakpoint
CREATE FUNCTION public.check_round_rules_complete() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(
  SELECT 1 FROM public.game_rules r WHERE r.game_id=NEW.game_id AND r.enabled AND NOT EXISTS(
   SELECT 1 FROM public.game_rule_executions e WHERE e.rule_id=r.id AND e.round_id=NEW.id AND e.transaction_id=pg_current_xact_id()::text))
 THEN RAISE EXCEPTION 'Round close requires all enabled rules'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER rounds_rules_complete AFTER UPDATE ON public.rounds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_round_rules_complete();
--> statement-breakpoint
CREATE FUNCTION public.guard_current_automatic_author() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.updated_by IS NULL AND (TG_OP='INSERT' OR OLD.updated_by IS NOT NULL OR NEW.revision<>OLD.revision) THEN
  IF NEW.phase<>'current' OR NOT EXISTS(SELECT 1 FROM public.game_rule_executions e WHERE e.state_set_id=NEW.id AND e.revision=NEW.revision AND e.reason='timer' AND e.actor_id IS NULL AND e.transaction_id=pg_current_xact_id()::text)
  THEN RAISE EXCEPTION 'Null author requires a validated automatic rule'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_state_sets_automatic_author BEFORE INSERT OR UPDATE ON public.game_state_sets FOR EACH ROW EXECUTE FUNCTION public.guard_current_automatic_author();
--> statement-breakpoint
CREATE FUNCTION public.check_start_rules() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='active' AND OLD.status IN ('draft','ready') AND EXISTS(
  SELECT 1 FROM public.game_rules r WHERE r.game_id=NEW.id AND r.enabled AND
  (r.trigger_type<>'round_end' OR NOT EXISTS(SELECT 1 FROM public.game_rule_effects WHERE rule_id=r.id) OR EXISTS(
    SELECT 1 FROM public.game_rule_effects f JOIN public.kpi_definitions k ON k.id=f.kpi_definition_id
    WHERE f.rule_id=r.id AND (k.value_type<>'numeric' OR f.amount<>round(f.amount,k.precision) OR NOT EXISTS(
     SELECT 1 FROM public.game_state_sets s JOIN public.game_state_values v ON v.state_set_id=s.id WHERE s.game_id=NEW.id AND s.phase='current' AND v.kpi_definition_id=k.id AND v.value IS NOT NULL)))))
 THEN RAISE EXCEPTION 'Start requires valid enabled rules and configured numeric targets'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER games_rules_start AFTER UPDATE ON public.games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_start_rules();
--> statement-breakpoint
REVOKE ALL ON public.game_rules,public.game_rule_effects,public.game_rule_executions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_rules,public.game_rule_effects TO service_role;
GRANT SELECT,INSERT,DELETE ON public.game_rule_executions TO service_role;
REVOKE ALL ON FUNCTION public.guard_rule_configuration(),public.check_rule_definition(),public.guard_rule_execution(),public.check_rule_execution_complete(),public.check_round_rules_complete(),public.guard_current_automatic_author(),public.check_start_rules(),public.check_rule_effect_applied() FROM PUBLIC,anon,authenticated;
