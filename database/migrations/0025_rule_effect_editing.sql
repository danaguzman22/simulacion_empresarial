CREATE TABLE "game_rule_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"effect_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kpi_definition_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"discarded_by_reset_id" uuid,
	"reason" text NOT NULL,
	"before_amount" numeric NOT NULL,
	"after_amount" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_rule_changes_valid" CHECK ("game_rule_changes"."revision">0 and length(trim("game_rule_changes"."reason")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "game_rule_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_rule_changes" ADD CONSTRAINT "game_rule_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_rule_changes_effect_revision_unique" ON "game_rule_changes" USING btree ("effect_id","revision");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_rule_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE gid uuid; cid uuid; actor uuid; r public.game_rules%ROWTYPE; k public.kpi_definitions%ROWTYPE;
BEGIN
 gid:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 cid:=CASE WHEN TG_OP='DELETE' THEN OLD.campaign_id ELSE NEW.campaign_id END;
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(gid,ARRAY['delete']) THEN RETURN OLD; END IF;
 -- Reset restores configuration without making a new runtime edit.
 IF TG_OP='UPDATE' AND public.lifecycle_mutation_allowed(gid,ARRAY['reset']) THEN
  SELECT c.actor_id INTO actor FROM public.game_lifecycle_changes c WHERE c.game_id=gid
   AND c.operation='reset' AND c.transaction_id=pg_current_xact_id()::text;
  IF TG_TABLE_NAME='game_rules' THEN
   IF (to_jsonb(NEW)-ARRAY['revision','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_by','updated_at'])
    OR NEW.revision<>OLD.revision+1 OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid rule reset revision'; END IF;
   NEW.updated_at:=clock_timestamp();
  ELSE
   IF (to_jsonb(NEW)-'amount') IS DISTINCT FROM (to_jsonb(OLD)-'amount') OR NEW.amount IS DISTINCT FROM (
    SELECT c.before_amount FROM public.game_rule_changes c WHERE c.effect_id=OLD.id AND c.game_id=gid AND c.discarded_by_reset_id IS NULL ORDER BY c.revision LIMIT 1)
   THEN RAISE EXCEPTION 'Reset must restore the pre-Start rule amount'; END IF;
  END IF;
  RETURN NEW;
 END IF;

 actor:=nullif(current_setting('nexus.rule_actor',true),'')::uuid;
 PERFORM 1 FROM public.campaigns WHERE id=cid FOR UPDATE;
 -- Runtime editing is deliberately limited to amounts, under the same campaign/game locks as close.
 PERFORM 1 FROM public.games WHERE id=gid AND campaign_id=cid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.games WHERE id=gid AND status IN ('active','paused')) THEN
  IF EXISTS(SELECT 1 FROM public.rounds WHERE game_id=gid AND status='active' AND ends_at<=clock_timestamp()) THEN
   RAISE EXCEPTION 'RULE_EDIT_ROUND_EXPIRED';
  END IF;
  PERFORM 1 FROM public.campaign_members WHERE campaign_id=cid AND profile_id=actor AND role='master' FOR SHARE;
  IF NOT FOUND OR TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Only Master may update existing runtime effects'; END IF;
  IF length(trim(coalesce(current_setting('nexus.rule_reason',true),''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Runtime rule edit requires a reason'; END IF;
  IF TG_TABLE_NAME='game_rules' THEN
   IF (to_jsonb(NEW)-ARRAY['revision','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_by','updated_at'])
     OR NEW.revision<>OLD.revision+1 OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Runtime rule structure/revision is immutable'; END IF;
   NEW.updated_at:=clock_timestamp();
  ELSE
   IF (to_jsonb(NEW)-'amount') IS DISTINCT FROM (to_jsonb(OLD)-'amount') THEN RAISE EXCEPTION 'Only the amount may change during runtime'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.game_rules WHERE id=NEW.rule_id AND updated_by=actor
     AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'Effect update requires a rule revision in the same transaction'; END IF;
   SELECT * INTO k FROM public.kpi_definitions WHERE id=NEW.kpi_definition_id AND campaign_id=cid;
   IF NOT FOUND OR k.value_type<>'numeric' OR NEW.amount<>round(NEW.amount,k.precision) THEN RAISE EXCEPTION 'Invalid numeric rule effect'; END IF;
  END IF;
  RETURN NEW;
 END IF;

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

--> statement-breakpoint
CREATE FUNCTION public.audit_runtime_rule_effect() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.amount IS DISTINCT FROM OLD.amount AND EXISTS(SELECT 1 FROM public.games WHERE id=NEW.game_id AND status IN ('active','paused')) THEN
  INSERT INTO public.game_rule_changes(rule_id,effect_id,game_id,campaign_id,kpi_definition_id,actor_id,revision,reason,before_amount,after_amount,created_at)
  SELECT NEW.rule_id,NEW.id,NEW.game_id,NEW.campaign_id,NEW.kpi_definition_id,r.updated_by,r.revision,
   trim(current_setting('nexus.rule_reason',true)),OLD.amount,NEW.amount,clock_timestamp()
  FROM public.game_rules r WHERE r.id=NEW.rule_id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_rule_effects_runtime_audit AFTER UPDATE ON public.game_rule_effects FOR EACH ROW EXECUTE FUNCTION public.audit_runtime_rule_effect();
--> statement-breakpoint
CREATE FUNCTION public.guard_rule_change_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) THEN RETURN OLD; END IF;

 IF TG_OP='UPDATE' AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) THEN
  IF OLD.discarded_by_reset_id IS NOT NULL OR NEW.discarded_by_reset_id IS NULL
   OR (to_jsonb(NEW)-'discarded_by_reset_id') IS DISTINCT FROM (to_jsonb(OLD)-'discarded_by_reset_id')
   OR NOT EXISTS(SELECT 1 FROM public.game_lifecycle_changes c WHERE c.operation_id=NEW.discarded_by_reset_id
    AND c.game_id=OLD.game_id AND c.operation='reset' AND c.transaction_id=pg_current_xact_id()::text)
  THEN RAISE EXCEPTION 'Invalid discarded rule change'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Rule change history is generated by effect updates and is immutable'; END IF;
 IF NEW.discarded_by_reset_id IS NOT NULL THEN RAISE EXCEPTION 'New runtime changes cannot be discarded'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_rule_changes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_rule_changes FOR EACH ROW EXECUTE FUNCTION public.guard_rule_change_history();
REVOKE ALL ON public.game_rule_changes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_rule_changes TO service_role;
REVOKE ALL ON FUNCTION public.audit_runtime_rule_effect(),public.guard_rule_change_history() FROM PUBLIC,anon,authenticated;

--> statement-breakpoint
-- The existing Reset transaction updates games to ready after discarding runtime states.
-- Restore from the first change of this run, then archive that run's changes explicitly.
CREATE FUNCTION public.reset_rule_effects() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE reset_id uuid; actor uuid;
BEGIN
 IF NEW.status='ready' AND public.lifecycle_mutation_allowed(NEW.id,ARRAY['reset']) THEN
  SELECT operation_id,actor_id INTO STRICT reset_id,actor FROM public.game_lifecycle_changes
   WHERE game_id=NEW.id AND operation='reset' AND transaction_id=pg_current_xact_id()::text;
  UPDATE public.game_rules r SET revision=r.revision+1,updated_by=actor
   WHERE r.game_id=NEW.id AND EXISTS(SELECT 1 FROM public.game_rule_changes c WHERE c.rule_id=r.id AND c.discarded_by_reset_id IS NULL);
  UPDATE public.game_rule_effects e SET amount=baseline.before_amount FROM (
   SELECT DISTINCT ON (effect_id) effect_id,before_amount FROM public.game_rule_changes
   WHERE game_id=NEW.id AND discarded_by_reset_id IS NULL ORDER BY effect_id,revision
  ) baseline WHERE e.id=baseline.effect_id AND e.game_id=NEW.id;
  UPDATE public.game_rule_changes SET discarded_by_reset_id=reset_id WHERE game_id=NEW.id AND discarded_by_reset_id IS NULL;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER games_reset_rule_effects AFTER UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.reset_rule_effects();
REVOKE ALL ON FUNCTION public.reset_rule_effects() FROM PUBLIC,anon,authenticated;

--> statement-breakpoint
CREATE FUNCTION public.delete_rule_change_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- The child guard permits this only inside the existing authorized Delete transaction.
 DELETE FROM public.game_rule_changes WHERE game_id=OLD.id;
 RETURN OLD;
END; $$;
CREATE TRIGGER games_delete_rule_change_history BEFORE DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION public.delete_rule_change_history();
REVOKE ALL ON FUNCTION public.delete_rule_change_history() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.check_rule_edit_deadline() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- Recheck at transaction end as well: expiry may occur after the write guard ran.
 IF NOT COALESCE(public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']),false)
  AND EXISTS(SELECT 1 FROM public.games WHERE id=NEW.game_id AND status IN ('active','paused'))
  AND EXISTS(SELECT 1 FROM public.rounds WHERE game_id=NEW.game_id AND status='active' AND ends_at<=clock_timestamp())
 THEN RAISE EXCEPTION 'RULE_EDIT_ROUND_EXPIRED'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_rules_edit_deadline AFTER UPDATE ON public.game_rules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_edit_deadline();
CREATE CONSTRAINT TRIGGER game_rule_effects_edit_deadline AFTER UPDATE ON public.game_rule_effects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_rule_edit_deadline();
REVOKE ALL ON FUNCTION public.check_rule_edit_deadline() FROM PUBLIC,anon,authenticated;
