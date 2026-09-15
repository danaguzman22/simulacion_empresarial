-- Lineage remains on preparation. Only the per-game value policy is new.
ALTER TABLE public.game_kpis ADD COLUMN origin text NOT NULL DEFAULT 'new';
ALTER TABLE public.game_kpis ADD CONSTRAINT game_kpis_origin_check CHECK(origin IN ('inherited','redefined','new'));
CREATE OR REPLACE FUNCTION public.check_inherited_preparation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g uuid; p public.game_state_sets; source_game uuid;
BEGIN
 g:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 IF public.lifecycle_mutation_allowed(g,ARRAY['delete']) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.game_state_sets WHERE game_id=g AND phase='preparation';
 SELECT game_id INTO source_game FROM public.game_state_sets WHERE id=p.source_state_set_id;
 IF EXISTS(SELECT 1 FROM public.game_kpis k WHERE k.game_id=g AND
  ((k.origin IN ('inherited','redefined')) IS DISTINCT FROM EXISTS(SELECT 1 FROM public.game_kpis prev WHERE prev.game_id=source_game AND prev.kpi_definition_id=k.kpi_definition_id))) THEN RAISE EXCEPTION 'KPI origin must match predecessor membership'; END IF;
 IF EXISTS(SELECT 1 FROM public.game_kpis k
 LEFT JOIN public.game_state_values own ON own.state_set_id=p.id AND own.kpi_definition_id=k.kpi_definition_id
 LEFT JOIN public.game_state_values source ON source.state_set_id=p.source_state_set_id AND source.kpi_definition_id=k.kpi_definition_id
 WHERE k.game_id=g AND k.origin='inherited' AND ((own.id IS NULL)<>(source.id IS NULL) OR ROW(own.value,own.ordinal_key) IS DISTINCT FROM ROW(source.value,source.ordinal_key))) THEN RAISE EXCEPTION 'Inherited value must equal its frozen source'; END IF;
 RETURN NULL;
END; $$;

-- Metadata only: never change values, snapshots, revision or audit.
UPDATE public.game_kpis own SET origin=CASE WHEN EXISTS(
 SELECT 1 FROM public.game_state_sets s
 LEFT JOIN public.game_state_values v ON v.state_set_id=s.id AND v.kpi_definition_id=own.kpi_definition_id
 LEFT JOIN public.game_state_values source_value ON source_value.state_set_id=p.source_state_set_id AND source_value.kpi_definition_id=own.kpi_definition_id
 WHERE s.game_id=own.game_id AND s.phase IN ('preparation','initial')
 AND ((v.id IS NULL)<>(source_value.id IS NULL) OR ROW(v.value,v.ordinal_key) IS DISTINCT FROM ROW(source_value.value,source_value.ordinal_key))
) THEN 'redefined' ELSE 'inherited' END
FROM public.game_state_sets p JOIN public.game_state_sets source ON source.id=p.source_state_set_id
WHERE p.game_id=own.game_id AND p.phase='preparation' AND EXISTS(SELECT 1 FROM public.game_kpis previous WHERE previous.game_id=source.game_id AND previous.kpi_definition_id=own.kpi_definition_id);
-- Flush the metadata update under the previous audit rules before replacing them.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_inherited_game_kpi(target_game uuid,target_kpi uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.game_kpis WHERE game_id=target_game AND kpi_definition_id=target_kpi AND origin='inherited');
$$;
CREATE OR REPLACE FUNCTION public.guard_game_kpi() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.games; target_game uuid; target_kpi uuid;
BEGIN
 target_game:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 target_kpi:=CASE WHEN TG_OP='DELETE' THEN OLD.kpi_definition_id ELSE NEW.kpi_definition_id END;
 SELECT * INTO g FROM public.games WHERE id=target_game FOR UPDATE;
 PERFORM 1 FROM public.kpi_definitions WHERE id=target_kpi FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.game_id,NEW.kpi_definition_id,NEW.campaign_id,NEW.created_at,NEW.created_by) IS DISTINCT FROM ROW(OLD.game_id,OLD.kpi_definition_id,OLD.campaign_id,OLD.created_at,OLD.created_by)
   OR (OLD.historical_used_at IS NOT NULL AND NEW.historical_used_at IS DISTINCT FROM OLD.historical_used_at) THEN RAISE EXCEPTION 'Association identity and historical marker are immutable'; END IF;
  IF NEW.required=OLD.required AND NEW.origin=OLD.origin THEN RETURN NEW; END IF;
 END IF;
 IF g.status NOT IN ('draft','ready') OR EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=target_game AND (phase<>'preparation' OR frozen_at IS NOT NULL)) THEN RAISE EXCEPTION 'Game KPI configuration is locked'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_game_kpi_delete_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) THEN RETURN OLD; END IF;
 PERFORM 1 FROM public.games WHERE id=OLD.game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.games g JOIN public.game_state_sets p ON p.game_id=g.id AND p.phase='preparation' WHERE g.id=OLD.game_id AND g.status IN ('draft','ready') AND p.frozen_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id=OLD.game_id AND phase<>'preparation') THEN RAISE EXCEPTION 'Game KPI configuration is locked'; END IF;
 RETURN OLD;
END; $$;
CREATE OR REPLACE FUNCTION public.check_game_kpi_audited() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target_game uuid;
BEGIN
 IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['delete']) THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND NEW.required=OLD.required AND NEW.origin=OLD.origin THEN RETURN NULL; END IF;
 target_game:=CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
 IF NOT EXISTS(SELECT 1 FROM public.game_state_sets s JOIN public.game_preparation_changes c ON c.state_set_id=s.id AND c.revision=s.revision WHERE s.game_id=target_game AND s.phase='preparation' AND c.actor_id=s.updated_by AND c.transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'KPI configuration requires an audited preparation revision'; END IF;
 RETURN NULL;
END; $$;
-- Covers value deletion too; excluded KPIs disappear before this deferred check.
CREATE CONSTRAINT TRIGGER game_state_values_inheritance AFTER INSERT OR UPDATE OR DELETE ON public.game_state_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_inherited_preparation();
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
   (public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) AND EXISTS(SELECT 1 FROM public.game_state_sets s WHERE s.id=OLD.state_set_id AND s.phase IN ('initial','current','final')))) THEN RETURN OLD; END IF;
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

  -- Inherited equality is checked at commit, allowing atomic exclusion or mode change.
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
  IF TG_OP='DELETE' AND OLD.phase IN ('initial','current','final')
   AND public.lifecycle_mutation_allowed(OLD.game_id,ARRAY['reset']) THEN RETURN OLD; END IF;
  -- Reopen the unchanged preparation, after the old execution was removed.
  IF TG_OP='UPDATE' AND OLD.phase='preparation'
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

    IF TG_OP='INSERT' AND source.game_id IS DISTINCT FROM (SELECT id FROM public.games WHERE campaign_id=NEW.campaign_id AND sequence<target_sequence ORDER BY sequence DESC LIMIT 1) THEN RAISE EXCEPTION 'Source must be the predecessor final'; END IF;

    IF source_sequence >= target_sequence OR source_game_status <> 'completed' THEN
      RAISE EXCEPTION 'Source must belong to an earlier completed game';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_inherited_game_kpi(uuid,uuid),public.guard_game_kpi(),public.guard_game_kpi_delete_lifecycle(),public.check_game_kpi_audited(),public.check_inherited_preparation(),public.guard_game_state_value(),public.guard_game_state_set() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_inherited_game_kpi(uuid,uuid) TO service_role;
