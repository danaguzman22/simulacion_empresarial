-- Game-local goals. No changes to 0000-0020, no backfill of goals/results.
CREATE TABLE public.game_goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL CONSTRAINT game_goals_game_id_games_id_fk REFERENCES public.games(id), campaign_id uuid NOT NULL CONSTRAINT game_goals_campaign_id_campaigns_id_fk REFERENCES public.campaigns(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160), description text CHECK(length(description)<=4000),
 goal_type text NOT NULL CONSTRAINT game_goals_type_check CHECK(goal_type IN ('generic','kpi')),
 kpi_definition_id uuid, operator text, numeric_target numeric, ordinal_target_key text,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid NOT NULL CONSTRAINT game_goals_created_by_profiles_id_fk REFERENCES public.profiles(id), updated_by uuid NOT NULL CONSTRAINT game_goals_updated_by_profiles_id_fk REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_during_round_id uuid CONSTRAINT game_goals_created_during_round_id_rounds_id_fk REFERENCES public.rounds(id), created_round_sequence integer, created_period_label text,
 fulfilled boolean, evaluated_by uuid CONSTRAINT game_goals_evaluated_by_profiles_id_fk REFERENCES public.profiles(id), evaluated_at timestamptz, observation text CHECK(length(observation)<=4000), suggested_fulfilled boolean,
 CONSTRAINT game_goals_selection_fk FOREIGN KEY(game_id,kpi_definition_id) REFERENCES public.game_kpis(game_id,kpi_definition_id),
 CONSTRAINT game_goals_ordinal_fk FOREIGN KEY(kpi_definition_id,ordinal_target_key) REFERENCES public.kpi_ordinal_options(kpi_definition_id,key),
 CONSTRAINT game_goals_target_check CHECK(
 (goal_type='generic' AND kpi_definition_id IS NULL AND operator IS NULL AND numeric_target IS NULL AND ordinal_target_key IS NULL) OR
 (goal_type='kpi' AND kpi_definition_id IS NOT NULL AND operator IS NOT NULL AND operator IN ('>=','<=','=','>','<','!=') AND
 ((numeric_target IS NOT NULL AND ordinal_target_key IS NULL AND numeric_target::text NOT IN ('NaN','Infinity','-Infinity') AND abs(numeric_target)<1e24 AND numeric_target=round(numeric_target,12)) OR
 (numeric_target IS NULL AND ordinal_target_key IS NOT NULL AND operator='=')))),
 CONSTRAINT game_goals_evaluation_check CHECK((fulfilled IS NULL AND evaluated_by IS NULL AND evaluated_at IS NULL AND observation IS NULL AND suggested_fulfilled IS NULL) OR (fulfilled IS NOT NULL AND evaluated_by IS NOT NULL AND evaluated_at IS NOT NULL))
);
CREATE TABLE public.game_goal_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL, game_id uuid NOT NULL, campaign_id uuid NOT NULL, goal_id uuid NOT NULL,
 actor_id uuid NOT NULL CONSTRAINT game_goal_changes_actor_id_profiles_id_fk REFERENCES public.profiles(id), operation text NOT NULL, request_hash text NOT NULL, "before" jsonb, "after" jsonb, round_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
-- IDs in this audit deliberately survive deletion of their game/goal/round.
CREATE UNIQUE INDEX game_goal_changes_operation_unique ON public.game_goal_changes(operation_id);
CREATE INDEX game_goal_changes_game_idx ON public.game_goal_changes(game_id,created_at);
CREATE TABLE public.game_results (
 game_id uuid PRIMARY KEY CONSTRAINT game_results_game_id_games_id_fk REFERENCES public.games(id), fulfilled_count integer NOT NULL CHECK(fulfilled_count>=0), evaluated_count integer NOT NULL CONSTRAINT game_results_evaluated_count_check CHECK(evaluated_count>=fulfilled_count),
 category text, created_by uuid NOT NULL CONSTRAINT game_results_created_by_profiles_id_fk REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION public.goal_result_category(fulfilled integer,evaluated integer) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN evaluated=0 THEN NULL WHEN fulfilled::bigint*100>=evaluated::bigint*80 THEN 'epic_victory'
 WHEN fulfilled::bigint*100>=evaluated::bigint*60 THEN 'partial_victory' WHEN fulfilled::bigint*100>=evaluated::bigint*40 THEN 'balanced'
 WHEN fulfilled::bigint*100>=evaluated::bigint*20 THEN 'partial_failure' ELSE 'epic_failure' END;
$$;
CREATE FUNCTION public.goal_suggestion(target public.game_goals) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v public.game_state_values;
BEGIN
 IF target.goal_type='generic' THEN RETURN NULL; END IF;
 SELECT val.* INTO v FROM public.game_state_values val JOIN public.game_state_sets s ON s.id=val.state_set_id WHERE s.game_id=target.game_id AND s.phase='current' AND val.kpi_definition_id=target.kpi_definition_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF target.ordinal_target_key IS NOT NULL THEN RETURN v.ordinal_key=target.ordinal_target_key; END IF;
 RETURN CASE target.operator WHEN '>=' THEN v.value>=target.numeric_target WHEN '<=' THEN v.value<=target.numeric_target WHEN '=' THEN v.value=target.numeric_target WHEN '>' THEN v.value>target.numeric_target WHEN '<' THEN v.value<target.numeric_target WHEN '!=' THEN v.value<>target.numeric_target END;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_game_goal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.games; k public.kpi_definitions; r public.rounds; actor uuid; target_game uuid; reset_allowed boolean;
BEGIN
 target_game:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 SELECT * INTO g FROM public.games WHERE id=target_game FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(g.id,ARRAY['delete']) THEN RETURN OLD; END IF;
 reset_allowed:=public.lifecycle_mutation_allowed(g.id,ARRAY['reset']);
 IF TG_OP='UPDATE' AND reset_allowed THEN
  IF (to_jsonb(NEW)-ARRAY['fulfilled','evaluated_by','evaluated_at','observation','suggested_fulfilled','created_during_round_id','revision','updated_at','updated_by']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['fulfilled','evaluated_by','evaluated_at','observation','suggested_fulfilled','created_during_round_id','revision','updated_at','updated_by']) OR NEW.fulfilled IS NOT NULL OR NEW.created_during_round_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid goal reset'; END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
 END IF;
 actor:=NULLIF(current_setting('nexus.goal_actor',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id=g.campaign_id AND profile_id=actor AND role='master') THEN RAISE EXCEPTION 'Only campaign Master may change goals'; END IF;
 IF g.status='completed' THEN RAISE EXCEPTION 'Completed goals are historical'; END IF;
 IF EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id) THEN RAISE EXCEPTION 'Goals cannot change after result storage'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.game_id,NEW.campaign_id,NEW.created_by,NEW.created_at,NEW.created_during_round_id,NEW.created_round_sequence,NEW.created_period_label) IS DISTINCT FROM ROW(OLD.id,OLD.game_id,OLD.campaign_id,OLD.created_by,OLD.created_at,OLD.created_during_round_id,OLD.created_round_sequence,OLD.created_period_label) THEN RAISE EXCEPTION 'Goal identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid goal revision'; END IF;
 END IF;
 IF g.status='evaluation' THEN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Only evaluation is allowed'; END IF;
  IF ROW(NEW.title,NEW.description,NEW.goal_type,NEW.kpi_definition_id,NEW.operator,NEW.numeric_target,NEW.ordinal_target_key) IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.goal_type,OLD.kpi_definition_id,OLD.operator,OLD.numeric_target,OLD.ordinal_target_key) THEN RAISE EXCEPTION 'Goal definition is locked'; END IF;
  IF NEW.fulfilled IS NULL THEN RAISE EXCEPTION 'An evaluation is required'; END IF;
  NEW.evaluated_by:=actor; NEW.evaluated_at:=clock_timestamp(); NEW.suggested_fulfilled:=public.goal_suggestion(NEW);
 ELSE
  IF g.status IN ('draft','ready') THEN
   IF EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=g.id AND (phase<>'preparation' OR frozen_at IS NOT NULL)) OR (TG_OP<>'INSERT' AND OLD.created_round_sequence IS NOT NULL) THEN RAISE EXCEPTION 'Goal definition is locked'; END IF;
   IF TG_OP='INSERT' THEN NEW.created_during_round_id:=NULL; NEW.created_round_sequence:=NULL; NEW.created_period_label:=NULL; END IF;
  ELSIF g.status IN ('active','paused') AND TG_OP='INSERT' THEN
   SELECT * INTO r FROM public.rounds WHERE game_id=g.id AND (status='paused' OR (status='active' AND ends_at>clock_timestamp())) FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'A current active or paused round is required'; END IF;
   NEW.created_during_round_id:=r.id; NEW.created_round_sequence:=r.sequence; NEW.created_period_label:=coalesce(g.period_label,'Ronda');
  ELSE RAISE EXCEPTION 'Goal definition cannot change in this game status'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.fulfilled IS NOT NULL OR NEW.evaluated_at IS NOT NULL OR NEW.evaluated_by IS NOT NULL OR NEW.suggested_fulfilled IS NOT NULL OR NEW.observation IS NOT NULL THEN RAISE EXCEPTION 'Evaluate only during evaluation'; END IF;
 END IF;
 IF NEW.campaign_id<>g.campaign_id THEN RAISE EXCEPTION 'Goal campaign mismatch'; END IF;
 IF NEW.goal_type='kpi' THEN
  SELECT * INTO k FROM public.kpi_definitions WHERE id=NEW.kpi_definition_id FOR SHARE;
  IF NOT FOUND OR k.campaign_id<>g.campaign_id OR (k.value_type='numeric' AND (NEW.numeric_target IS NULL OR NEW.ordinal_target_key IS NOT NULL)) OR (k.value_type='ordinal' AND (NEW.numeric_target IS NOT NULL OR NEW.ordinal_target_key IS NULL)) THEN RAISE EXCEPTION 'Goal target type or campaign mismatch'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN NEW.created_by:=actor; NEW.created_at:=clock_timestamp(); NEW.revision:=1; END IF;
 NEW.updated_by:=actor; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER game_goals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_goals FOR EACH ROW EXECUTE FUNCTION public.guard_game_goal();
--> statement-breakpoint
CREATE FUNCTION public.audit_game_goal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.game_goals; op text; actor uuid; operation_id uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 actor:=NULLIF(current_setting('nexus.goal_actor',true),'')::uuid;
 IF public.lifecycle_mutation_allowed(target.game_id,ARRAY['reset','delete']) THEN
  SELECT actor_id INTO actor FROM public.game_lifecycle_changes WHERE transaction_id=pg_current_xact_id()::text AND details->>'subjectGameId'=target.game_id::text AND operation=current_setting('nexus.lifecycle_operation',true) LIMIT 1;
  op:='goal_'||current_setting('nexus.lifecycle_operation',true); operation_id:=gen_random_uuid();
 ELSE
  operation_id:=NULLIF(current_setting('nexus.goal_operation_id',true),'')::uuid;
  IF operation_id IS NULL THEN RAISE EXCEPTION 'Goal operation ID required'; END IF;
  op:=CASE WHEN TG_OP='DELETE' THEN 'goal_deleted' WHEN TG_OP='INSERT' AND target.created_during_round_id IS NOT NULL THEN 'goal_created_during_round' WHEN TG_OP='INSERT' THEN 'goal_created' WHEN target.fulfilled IS NOT NULL THEN 'goal_evaluated' ELSE 'goal_updated' END;
 END IF;
 INSERT INTO public.game_goal_changes(operation_id,game_id,campaign_id,goal_id,actor_id,operation,request_hash,"before","after",round_id)
 VALUES(operation_id,target.game_id,target.campaign_id,target.id,actor,op,coalesce(nullif(current_setting('nexus.goal_request_hash',true),''),'lifecycle'),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,target.created_during_round_id);
 RETURN NULL;
END; $$;
CREATE TRIGGER game_goals_audit AFTER INSERT OR UPDATE OR DELETE ON public.game_goals FOR EACH ROW EXECUTE FUNCTION public.audit_game_goal();
CREATE FUNCTION public.guard_goal_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Goal audit is immutable and generated by goal mutations'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER game_goal_changes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_goal_changes FOR EACH ROW EXECUTE FUNCTION public.guard_goal_audit();
--> statement-breakpoint
CREATE FUNCTION public.guard_goal_kpi_type() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.value_type IS DISTINCT FROM OLD.value_type AND EXISTS(SELECT 1 FROM public.game_goals WHERE kpi_definition_id=OLD.id) THEN RAISE EXCEPTION 'Remove or change associated goals before changing KPI type'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER goal_kpi_type_guard BEFORE UPDATE ON public.kpi_definitions FOR EACH ROW EXECUTE FUNCTION public.guard_goal_kpi_type();
CREATE FUNCTION public.guard_game_result() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.games; total integer; fulfilled integer; evaluated integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Historical game result is immutable'; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 IF g.status<>'evaluation' OR NOT EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id=g.campaign_id AND profile_id=NEW.created_by AND role IN ('master','co_master')) THEN RAISE EXCEPTION 'Invalid result authorization or status'; END IF;
 SELECT count(*),count(*) FILTER(WHERE game_goals.fulfilled IS TRUE),count(*) FILTER(WHERE game_goals.fulfilled IS NOT NULL) INTO total,fulfilled,evaluated FROM public.game_goals WHERE game_id=g.id;
 IF total<>evaluated THEN RAISE EXCEPTION 'All goals must be evaluated'; END IF;
 IF NEW.fulfilled_count<>fulfilled OR NEW.evaluated_count<>evaluated OR NEW.category IS DISTINCT FROM public.goal_result_category(fulfilled,evaluated) THEN RAISE EXCEPTION 'Result must match evaluated goals'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER game_results_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_results FOR EACH ROW EXECUTE FUNCTION public.guard_game_result();
CREATE FUNCTION public.check_game_goal_finish() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.games g JOIN public.game_results r ON r.game_id=g.id WHERE g.id=NEW.game_id AND g.status='completed') THEN RAISE EXCEPTION 'Result and completed game must commit together'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_result_finish AFTER INSERT ON public.game_results DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_game_goal_finish();
CREATE FUNCTION public.check_game_goal_completion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status<>'completed' AND (
 EXISTS(SELECT 1 FROM public.game_goals WHERE game_id=NEW.id AND fulfilled IS NULL) OR
 NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=NEW.id)) THEN RAISE EXCEPTION 'Evaluate all goals and store the result before completing the game'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game_goal_completion BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.check_game_goal_completion();
--> statement-breakpoint
ALTER TABLE public.game_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_goal_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_goals,public.game_goal_changes,public.game_results FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_goals TO service_role;
GRANT SELECT,INSERT ON public.game_goal_changes,public.game_results TO service_role;
REVOKE ALL ON FUNCTION public.guard_game_goal(),public.audit_game_goal(),public.guard_goal_audit(),public.guard_goal_kpi_type(),public.guard_game_result(),public.check_game_goal_finish(),public.check_game_goal_completion(),public.goal_result_category(integer,integer),public.goal_suggestion(public.game_goals) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.goal_result_category(integer,integer),public.goal_suggestion(public.game_goals) TO service_role;
