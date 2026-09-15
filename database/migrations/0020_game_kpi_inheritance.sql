-- Inheritance is derived from the immutable source game's effective selections.
CREATE FUNCTION public.is_inherited_game_kpi(target_game uuid, target_kpi uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.game_state_sets p JOIN public.game_state_sets source ON source.id=p.source_state_set_id JOIN public.game_kpis k ON k.game_id=source.game_id
 WHERE p.game_id=target_game AND p.phase='preparation' AND k.kpi_definition_id=target_kpi);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_kpi()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; target_game uuid; target_kpi uuid;
BEGIN
 IF TG_OP='DELETE' THEN target_game:=OLD.game_id; target_kpi:=OLD.kpi_definition_id;
 ELSE target_game:=NEW.game_id; target_kpi:=NEW.kpi_definition_id; END IF;
 SELECT * INTO g FROM public.games WHERE id=target_game FOR UPDATE;
 PERFORM 1 FROM public.kpi_definitions WHERE id=target_kpi FOR UPDATE;
 IF public.is_inherited_game_kpi(target_game,target_kpi) THEN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.required IS DISTINCT FROM OLD.required) THEN RAISE EXCEPTION 'Inherited KPI selection and requirement cannot change'; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.game_state_sets p JOIN public.game_state_sets source ON source.id=p.source_state_set_id JOIN public.game_kpis k ON k.game_id=source.game_id WHERE p.game_id=target_game AND p.phase='preparation' AND k.kpi_definition_id=target_kpi AND k.required=NEW.required) THEN RAISE EXCEPTION 'Inherited requirement must match its source'; END IF;
 END IF;
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_kpi_delete_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) THEN RETURN OLD; END IF;
 PERFORM 1 FROM public.games WHERE id=OLD.game_id FOR UPDATE;
 IF public.is_inherited_game_kpi(OLD.game_id,OLD.kpi_definition_id) THEN RAISE EXCEPTION 'Inherited KPI cannot be removed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=OLD.game_id AND phase='preparation' AND frozen_at IS NULL) THEN RAISE EXCEPTION 'An editable preparation is required'; END IF;
 IF OLD.historical_used_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id AND status IN ('draft','ready')) OR EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=OLD.game_id AND (phase<>'preparation' OR frozen_at IS NOT NULL)) THEN RAISE EXCEPTION 'Game KPI selection is no longer editable'; END IF;
 RETURN OLD;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_state_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
  definition public.kpi_definitions%ROWTYPE;
  target_id uuid;
  game_status text;
BEGIN
  IF TG_OP='DELETE' AND (public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) OR
   (public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) AND EXISTS(SELECT 1 FROM public.game_state_sets s WHERE s.id=OLD.state_set_id AND (s.phase IN ('current','final') OR (s.phase='initial' AND s.source_state_set_id IS NULL))))) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.state_set_id;
  ELSE
    target_id := NEW.state_set_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND ROW(
      NEW.id,
      NEW.state_set_id,
      NEW.game_id,
      NEW.kpi_definition_id,
      NEW.campaign_id,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.state_set_id,
      OLD.game_id,
      OLD.kpi_definition_id,
      OLD.campaign_id,
      OLD.created_at
    )
  THEN
    RAISE EXCEPTION
      'State value identity is immutable';
  END IF;

  SELECT *
  INTO target
  FROM public.game_state_sets
  WHERE id = target_id
  FOR UPDATE;

  IF NOT FOUND
    OR target.frozen_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      'State is missing or frozen';
  END IF;

  IF target.phase='preparation' AND public.is_inherited_game_kpi(target.game_id,CASE WHEN TG_OP='DELETE' THEN OLD.kpi_definition_id ELSE NEW.kpi_definition_id END) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inherited preparation values cannot be removed'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=target.source_state_set_id AND v.kpi_definition_id=NEW.kpi_definition_id AND v.value IS NOT DISTINCT FROM NEW.value AND v.ordinal_key IS NOT DISTINCT FROM NEW.ordinal_key) THEN RAISE EXCEPTION 'Inherited value must match the frozen source'; END IF;
  END IF;
  IF target.phase = 'preparation' THEN
    SELECT status::text
    INTO game_status
    FROM public.games
    WHERE id = target.game_id;

    IF game_status NOT IN ('draft', 'ready') THEN
      RAISE EXCEPTION
        'Preparation cannot change after the game begins';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT *
  INTO definition
  FROM public.kpi_definitions
  WHERE id = NEW.kpi_definition_id
  FOR UPDATE;

  IF NOT FOUND
    OR definition.campaign_id <> target.campaign_id
    OR NEW.campaign_id <> target.campaign_id
  THEN
    RAISE EXCEPTION
      'KPI and state must belong to the same campaign';
  END IF;

  IF definition.value_type = 'numeric' THEN
    IF NEW.value IS NULL
      OR NEW.ordinal_key IS NOT NULL
      OR NEW.value::text IN ('NaN', 'Infinity', '-Infinity')
      OR abs(NEW.value) >= 1000000000000000000000000::numeric
      OR NEW.value <> round(NEW.value, definition.precision)
      OR (
        NEW.value < 0
        AND NOT definition.allows_negative
      )
    THEN
      RAISE EXCEPTION
        'Value violates the KPI numeric definition';
    END IF;
  ELSE
    IF NEW.value IS NOT NULL
      OR NEW.ordinal_key IS NULL
    THEN
      RAISE EXCEPTION
        'Value violates the KPI ordinal definition';
    END IF;

    PERFORM 1
    FROM public.kpi_ordinal_options o
    WHERE o.kpi_definition_id = definition.id
      AND o.key = NEW.ordinal_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Ordinal value is not a valid option for this KPI';
    END IF;
  END IF;

  IF definition.used_at IS NULL THEN
    UPDATE public.kpi_definitions
    SET used_at = now()
    WHERE id = definition.id;
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_state_set()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  source public.game_state_sets%ROWTYPE;
  source_sequence integer;
  target_sequence integer;
  source_game_status text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.source_state_set_id IS NOT NULL AND NEW.source_state_set_id IS DISTINCT FROM OLD.source_state_set_id THEN RAISE EXCEPTION 'The inherited source cannot be changed'; END IF;
  -- Reset may discard only this execution's snapshots, never preparation audit.
  IF TG_OP='DELETE' AND (OLD.phase IN ('current','final') OR (OLD.phase='initial' AND OLD.source_state_set_id IS NULL))
   AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) THEN RETURN OLD; END IF;
  -- Reopen only an origin-free preparation, after the old execution was removed.
  IF TG_OP='UPDATE' AND OLD.phase='preparation' AND OLD.source_state_set_id IS NULL
   AND OLD.frozen_at IS NOT NULL AND NEW.frozen_at IS NULL
   AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) THEN
   IF (to_jsonb(NEW)-ARRAY['frozen_at','revision','updated_at','updated_by']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['frozen_at','revision','updated_at','updated_by'])
    OR NEW.revision<>OLD.revision+1
    OR EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=OLD.game_id AND phase<>'preparation')
    OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id AND status IN ('draft','ready')) THEN
    RAISE EXCEPTION 'Reset must discard runtime before reopening preparation';
   END IF;
   NEW.updated_at:=clock_timestamp(); RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) THEN
    RETURN OLD;
  END IF;

  -- A restart may advance only the frozen preparation revision needed by the
  -- existing start-game audit. It must not reopen or alter the preparation.
  IF TG_OP = 'UPDATE'
     AND current_setting('nexus.lifecycle_operation', true) = 'restart'
     AND OLD.frozen_at IS NOT NULL THEN

    IF OLD.phase <> 'preparation' THEN
      RAISE EXCEPTION 'Restart may only revise the frozen preparation state';
    END IF;

    IF ROW(
      NEW.id,
      NEW.campaign_id,
      NEW.game_id,
      NEW.phase,
      NEW.source_state_set_id,
      NEW.frozen_at,
      NEW.created_by,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.campaign_id,
      OLD.game_id,
      OLD.phase,
      OLD.source_state_set_id,
      OLD.frozen_at,
      OLD.created_by,
      OLD.created_at
    ) THEN
      RAISE EXCEPTION 'Restart cannot modify frozen preparation content or identity';
    END IF;

    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Restart requires the next preparation revision';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    IF OLD.frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'A frozen state cannot be changed or deleted';
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF ROW(
      NEW.id,
      NEW.game_id,
      NEW.campaign_id,
      NEW.phase,
      NEW.created_by,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.game_id,
      OLD.campaign_id,
      OLD.phase,
      OLD.created_by,
      OLD.created_at
    ) THEN
      RAISE EXCEPTION 'State identity and phase are immutable';
    END IF;

    IF NEW.revision < OLD.revision OR NEW.revision > OLD.revision + 1 THEN
      RAISE EXCEPTION 'Invalid state revision';
    END IF;
  END IF;

  IF NEW.source_state_set_id IS NOT NULL THEN
    SELECT *
    INTO source
    FROM public.game_state_sets
    WHERE id = NEW.source_state_set_id;

    IF NOT FOUND
       OR source.campaign_id <> NEW.campaign_id
       OR source.game_id = NEW.game_id
       OR source.phase <> 'final'
       OR source.frozen_at IS NULL THEN
      RAISE EXCEPTION 'Source must be a frozen final snapshot of another game in the same campaign';
    END IF;

    SELECT sequence, status::text
    INTO source_sequence, source_game_status
    FROM public.games
    WHERE id = source.game_id;

    SELECT sequence
    INTO target_sequence
    FROM public.games
    WHERE id = NEW.game_id;

    IF source_sequence >= target_sequence OR source_game_status <> 'completed' THEN
      RAISE EXCEPTION 'Source must belong to an earlier completed game';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.check_inherited_preparation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g uuid; p public.game_state_sets; source_game uuid;
BEGIN
 g:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 IF public.lifecycle_mutation_allowed(g,ARRAY['delete']) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.game_state_sets WHERE game_id=g AND phase='preparation';
 IF p.source_state_set_id IS NULL THEN RETURN NULL; END IF;
 SELECT game_id INTO source_game FROM public.game_state_sets WHERE id=p.source_state_set_id;
 IF EXISTS(SELECT 1 FROM public.game_kpis k WHERE k.game_id=source_game AND NOT EXISTS(SELECT 1 FROM public.game_kpis own WHERE own.game_id=g AND own.kpi_definition_id=k.kpi_definition_id AND own.required=k.required)) THEN RAISE EXCEPTION 'Inherited selection must be complete'; END IF;
 IF EXISTS(SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=p.source_state_set_id AND NOT EXISTS(SELECT 1 FROM public.game_state_values own WHERE own.state_set_id=p.id AND own.kpi_definition_id=v.kpi_definition_id AND own.value IS NOT DISTINCT FROM v.value AND own.ordinal_key IS NOT DISTINCT FROM v.ordinal_key)) THEN RAISE EXCEPTION 'Inherited preparation must copy source values exactly'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER game_state_sets_inheritance AFTER INSERT OR UPDATE ON public.game_state_sets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_inherited_preparation();
CREATE CONSTRAINT TRIGGER game_kpis_inheritance AFTER INSERT OR UPDATE OR DELETE ON public.game_kpis DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_inherited_preparation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_inherited_game_kpi(uuid,uuid),public.check_inherited_preparation(),public.guard_game_kpi(),public.guard_game_kpi_delete_lifecycle(),public.guard_game_state_value(),public.guard_game_state_set() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_inherited_game_kpi(uuid,uuid) TO service_role;
