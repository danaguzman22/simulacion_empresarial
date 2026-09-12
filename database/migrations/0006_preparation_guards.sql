-- Server-only tables: no direct Data API access for browser roles.
REVOKE ALL ON TABLE public.kpi_definitions, public.game_state_sets,
  public.game_state_values, public.game_preparation_changes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kpi_definitions,
  public.game_state_sets, public.game_state_values TO service_role;
GRANT SELECT, INSERT ON TABLE public.game_preparation_changes TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.game_preparation_changes FROM service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_kpi_definition()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'A used KPI definition cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF ROW(NEW.id, NEW.campaign_id, NEW.key, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.campaign_id, OLD.key, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'KPI identity is immutable';
  END IF;
  IF OLD.used_at IS NOT NULL AND ROW(
    NEW.name, NEW.unit, NEW.precision, NEW.required, NEW.allows_negative, NEW.used_at
  ) IS DISTINCT FROM ROW(
    OLD.name, OLD.unit, OLD.precision, OLD.required, OLD.allows_negative, OLD.used_at
  ) THEN
    RAISE EXCEPTION 'A used KPI definition is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER kpi_definitions_guard BEFORE UPDATE OR DELETE ON public.kpi_definitions
FOR EACH ROW EXECUTE FUNCTION public.guard_kpi_definition();
--> statement-breakpoint
CREATE FUNCTION public.guard_game_state_set()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  source public.game_state_sets%ROWTYPE;
  source_sequence integer;
  target_sequence integer;
  source_game_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'A frozen state cannot be changed or deleted';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF ROW(NEW.id, NEW.game_id, NEW.campaign_id, NEW.phase, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.game_id, OLD.campaign_id, OLD.phase, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'State identity and phase are immutable';
    END IF;
    IF NEW.revision < OLD.revision OR NEW.revision > OLD.revision + 1 THEN
      RAISE EXCEPTION 'Invalid state revision';
    END IF;
  END IF;
  IF NEW.source_state_set_id IS NOT NULL THEN
    SELECT * INTO source FROM public.game_state_sets WHERE id = NEW.source_state_set_id;
    IF NOT FOUND OR source.campaign_id <> NEW.campaign_id OR source.game_id = NEW.game_id
      OR source.phase <> 'final' OR source.frozen_at IS NULL THEN
      RAISE EXCEPTION 'Source must be a frozen final snapshot of another game in the same campaign';
    END IF;
    SELECT sequence, status::text INTO source_sequence, source_game_status FROM public.games WHERE id = source.game_id;
    SELECT sequence INTO target_sequence FROM public.games WHERE id = NEW.game_id;
    IF source_sequence >= target_sequence OR source_game_status <> 'completed' THEN
      RAISE EXCEPTION 'Source must belong to an earlier completed game';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_state_sets_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_state_sets
FOR EACH ROW EXECUTE FUNCTION public.guard_game_state_set();
--> statement-breakpoint
-- Deferred to permit a future snapshot transaction to insert its values before freezing.
-- No initial/current/final lifecycle action is implemented in this delivery.
CREATE FUNCTION public.check_snapshot_frozen()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.game_state_sets
    WHERE id = NEW.id AND phase IN ('initial', 'final') AND frozen_at IS NULL) THEN
    RAISE EXCEPTION 'Initial and final snapshots must be frozen at commit';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER game_state_sets_snapshots_frozen
AFTER INSERT OR UPDATE ON public.game_state_sets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_snapshot_frozen();
--> statement-breakpoint
CREATE FUNCTION public.guard_game_state_value()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
  definition public.kpi_definitions%ROWTYPE;
  target_id uuid;
  game_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.state_set_id;
  ELSE target_id := NEW.state_set_id;
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.state_set_id, NEW.kpi_definition_id, NEW.campaign_id, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.state_set_id, OLD.kpi_definition_id, OLD.campaign_id, OLD.created_at) THEN
    RAISE EXCEPTION 'State value identity is immutable';
  END IF;
  SELECT * INTO target FROM public.game_state_sets WHERE id = target_id FOR UPDATE;
  IF NOT FOUND OR target.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'State is missing or frozen';
  END IF;
  IF target.phase = 'preparation' THEN
    SELECT status::text INTO game_status FROM public.games WHERE id = target.game_id;
    IF game_status NOT IN ('draft', 'ready') THEN
      RAISE EXCEPTION 'Preparation cannot change after the game begins';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO definition FROM public.kpi_definitions WHERE id = NEW.kpi_definition_id FOR UPDATE;
  IF NOT FOUND OR definition.campaign_id <> target.campaign_id OR NEW.campaign_id <> target.campaign_id THEN
    RAISE EXCEPTION 'KPI and state must belong to the same campaign';
  END IF;
  IF NEW.value::text IN ('NaN', 'Infinity', '-Infinity')
    OR abs(NEW.value) >= 1000000000000000000000000::numeric
    OR NEW.value <> round(NEW.value, definition.precision)
    OR (NEW.value < 0 AND NOT definition.allows_negative) THEN
    RAISE EXCEPTION 'Value violates the KPI numeric definition';
  END IF;
  IF definition.used_at IS NULL THEN
    UPDATE public.kpi_definitions SET used_at = now() WHERE id = definition.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_state_values_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_state_values
FOR EACH ROW EXECUTE FUNCTION public.guard_game_state_value();
--> statement-breakpoint
CREATE FUNCTION public.guard_preparation_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target public.game_state_sets%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Preparation audit records are immutable';
  END IF;
  -- Always assigned by PostgreSQL, never trusted from the caller.
  NEW.transaction_id := pg_current_xact_id()::text;
  SELECT * INTO target FROM public.game_state_sets WHERE id = NEW.state_set_id;
  IF NOT FOUND OR target.phase <> 'preparation' OR target.campaign_id <> NEW.campaign_id
    OR target.revision <> NEW.revision OR target.updated_by <> NEW.actor_id THEN
    RAISE EXCEPTION 'Audit record does not match the preparation revision';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_preparation_changes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_preparation_changes
FOR EACH ROW EXECUTE FUNCTION public.guard_preparation_change();
--> statement-breakpoint
CREATE FUNCTION public.check_preparation_revision_audited()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.phase = 'preparation' AND NEW.revision > 0 AND NOT EXISTS (
    SELECT 1 FROM public.game_preparation_changes
    WHERE state_set_id = NEW.id AND revision = NEW.revision AND actor_id = NEW.updated_by
  ) THEN
    RAISE EXCEPTION 'A preparation revision requires an audit record';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER game_state_sets_revision_audited
AFTER INSERT OR UPDATE ON public.game_state_sets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_preparation_revision_audited();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_kpi_definition(), public.guard_game_state_set(),
  public.check_snapshot_frozen(), public.guard_game_state_value(), public.guard_preparation_change(),
  public.check_preparation_revision_audited() FROM PUBLIC, anon, authenticated;

--> statement-breakpoint
-- A historical audit row cannot authorize writes in a later transaction.
-- Deferred checks allow the repository to write values before revision and audit.
CREATE FUNCTION public.check_preparation_values_audited()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
  target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.state_set_id;
  ELSE target_id := NEW.state_set_id;
  END IF;
  SELECT * INTO target FROM public.game_state_sets WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Changed state must exist at commit';
  END IF;
  IF target.phase = 'preparation' AND NOT EXISTS (
    SELECT 1 FROM public.game_preparation_changes
    WHERE state_set_id = target.id AND revision = target.revision
      AND actor_id = target.updated_by
      AND transaction_id = pg_current_xact_id()::text
  ) THEN
    RAISE EXCEPTION 'Preparation value changes require a new audited revision in the same transaction';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER game_state_values_preparation_audited
AFTER INSERT OR UPDATE OR DELETE ON public.game_state_values
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_preparation_values_audited();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.check_preparation_values_audited() FROM PUBLIC, anon, authenticated;
