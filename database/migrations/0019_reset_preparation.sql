-- Controlled reset to editable preparation; 0000-0018 are unchanged.
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
REVOKE ALL ON FUNCTION public.guard_game_state_value(),public.guard_game_state_set() FROM PUBLIC,anon,authenticated;
