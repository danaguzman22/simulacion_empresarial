-- Lifecycle audit for finalization, reset, deletion, and continuity creation.
CREATE TABLE public.game_lifecycle_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  operation_id uuid NOT NULL,
  game_id uuid,
  campaign_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  details jsonb NOT NULL,
  transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_lifecycle_changes_operation_valid
    CHECK (operation IN ('finish','reset','delete','create_from_previous'))
);
--> statement-breakpoint
ALTER TABLE public.game_lifecycle_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.game_lifecycle_changes
  ADD CONSTRAINT game_lifecycle_changes_game_campaign_fk
  FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE public.game_lifecycle_changes
  ADD CONSTRAINT game_lifecycle_changes_campaign_fk
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_lifecycle_changes
  ADD CONSTRAINT game_lifecycle_changes_actor_fk
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX game_lifecycle_changes_operation_unique
  ON public.game_lifecycle_changes(operation_id);
--> statement-breakpoint
REVOKE ALL ON public.game_lifecycle_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.game_lifecycle_changes TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_game_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Game lifecycle audit is immutable';
  END IF;

  IF NEW.operation NOT IN ('finish','reset','delete','create_from_previous') THEN
    RAISE EXCEPTION 'Invalid game lifecycle operation';
  END IF;

  NEW.transaction_id := pg_current_xact_id()::text;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_lifecycle_changes_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.game_lifecycle_changes
FOR EACH ROW EXECUTE FUNCTION public.guard_game_lifecycle_change();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_game_lifecycle_change()
FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

-- Lifecycle reset/delete operations are server-only and transaction-local.
-- Normal mutations keep all immutable audit and lifecycle guards active.
CREATE OR REPLACE FUNCTION public.guard_round_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Round audit is immutable';
  END IF;

  IF NEW.operation = 'set_duration' THEN
    RAISE EXCEPTION 'Runtime duration changes are no longer supported';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.rounds
      WHERE id = NEW.round_id
        AND revision = NEW.revision
    )
    OR (NEW.operation <> 'finish' AND NEW.actor_id IS NULL) THEN
    RAISE EXCEPTION 'Round audit revision/actor mismatch';
  END IF;

  NEW.transaction_id := pg_current_xact_id()::text;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_game_kpi_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Game KPI audit is immutable';
  END IF;

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

CREATE OR REPLACE FUNCTION public.check_current_kpi_value_audited()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_id uuid;
  target_phase text;
  target_revision integer;
  target_created_at timestamptz;
BEGIN
  IF current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
    RETURN NULL;
  END IF;

  target_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.state_set_id
    ELSE NEW.state_set_id
  END;

  SELECT phase::text, revision, created_at
  INTO target_phase, target_revision, target_created_at
  FROM public.game_state_sets
  WHERE id = target_id;

  IF target_phase = 'current'
     AND NOT (
       TG_OP = 'INSERT'
       AND target_created_at = transaction_timestamp()
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.game_kpi_changes
       WHERE state_set_id = target_id
         AND revision = target_revision
         AND transaction_id = pg_current_xact_id()::text
     ) THEN
    RAISE EXCEPTION 'Current KPI value change requires an audit record in the same transaction';
  END IF;

  RETURN NULL;
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
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
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

CREATE OR REPLACE FUNCTION public.guard_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  game_status text;
  configured_period_count integer;
  configured_period_duration integer;
  db_now timestamptz;
  manual_finish boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Round deletion is not supported';
  END IF;

  SELECT
    g.status::text,
    g.period_count,
    g.period_duration_seconds
  INTO
    game_status,
    configured_period_count,
    configured_period_duration
  FROM public.games g
  WHERE g.id = NEW.game_id
  FOR UPDATE;

  db_now := clock_timestamp();

  IF TG_OP = 'INSERT' THEN
    IF game_status NOT IN ('draft','ready')
       OR configured_period_count IS NULL
       OR configured_period_duration IS NULL
       OR NEW.sequence < 1
       OR NEW.sequence > configured_period_count
       OR NEW.duration_seconds IS DISTINCT FROM configured_period_duration
       OR NEW.status <> 'pending'
       OR NEW.created_by IS NULL
       OR NEW.revision <> 0 THEN
      RAISE EXCEPTION 'Invalid new round';
    END IF;

    NEW.created_at := db_now;
    NEW.updated_at := db_now;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.id,
    NEW.game_id,
    NEW.campaign_id,
    NEW.sequence,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.game_id,
    OLD.campaign_id,
    OLD.sequence,
    OLD.created_by,
    OLD.created_at
  )
  OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Invalid round identity or revision';
  END IF;

  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN
    RAISE EXCEPTION 'Duration cannot change after period creation';
  END IF;

  manual_finish :=
    NEW.status = 'completed'
    AND NEW.completed_at IS NOT NULL
    AND OLD.status IN ('active','paused');

  IF OLD.status IN ('active','paused') AND NEW.status = 'completed' THEN
    IF OLD.status = 'active'
       AND db_now < OLD.ends_at
       AND NOT manual_finish THEN
      RAISE EXCEPTION 'Round has not expired';
    END IF;

    IF NOT manual_finish THEN
      NEW.completed_at := OLD.ends_at;
    END IF;

    NEW.ends_at := NULL;
    NEW.remaining_ms := NULL;
    NEW.paused_at := NULL;
    NEW.started_at := OLD.started_at;
  ELSE
    IF game_status <> 'active' THEN
      RAISE EXCEPTION 'Game must be active';
    END IF;

    IF OLD.status = 'pending' AND NEW.status = 'active' THEN
      IF EXISTS (
        SELECT 1
        FROM public.rounds
        WHERE game_id = NEW.game_id
          AND sequence < NEW.sequence
          AND status <> 'completed'
      ) THEN
        RAISE EXCEPTION 'Earlier rounds must be finished';
      END IF;

      NEW.started_at := db_now;
      NEW.ends_at := db_now + NEW.duration_seconds * interval '1 second';
      NEW.remaining_ms := NULL;
      NEW.paused_at := NULL;
      NEW.completed_at := NULL;

    ELSIF OLD.status = 'active' AND NEW.status = 'paused' THEN
      IF db_now >= OLD.ends_at THEN
        RAISE EXCEPTION 'Round already expired';
      END IF;

      NEW.remaining_ms :=
        ceil(extract(epoch FROM (OLD.ends_at - db_now)) * 1000);
      NEW.ends_at := NULL;
      NEW.paused_at := db_now;
      NEW.started_at := OLD.started_at;
      NEW.completed_at := NULL;

    ELSIF OLD.status = 'paused' AND NEW.status = 'active' THEN
      NEW.ends_at :=
        db_now + OLD.remaining_ms * interval '1 millisecond';
      NEW.remaining_ms := NULL;
      NEW.paused_at := NULL;
      NEW.started_at := OLD.started_at;
      NEW.completed_at := NULL;

    ELSE
      RAISE EXCEPTION 'Invalid round transition';
    END IF;
  END IF;

  NEW.updated_at := db_now;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_game_preparation_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) = 'delete' THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Preparation audit records are immutable';
  END IF;

  NEW.transaction_id := pg_current_xact_id()::text;

  SELECT *
  INTO target
  FROM public.game_state_sets
  WHERE id = NEW.state_set_id;

  IF NOT FOUND
     OR target.phase <> 'preparation'
     OR target.campaign_id <> NEW.campaign_id
     OR target.revision <> NEW.revision
     OR target.updated_by <> NEW.actor_id THEN
    RAISE EXCEPTION 'Audit record does not match the preparation revision';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.check_preparation_values_audited()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
  target_id uuid;
BEGIN
  IF current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
    RETURN NULL;
  END IF;

  target_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.state_set_id
    ELSE NEW.state_set_id
  END;

  SELECT *
  INTO target
  FROM public.game_state_sets
  WHERE id = target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Changed state must exist at commit';
  END IF;

  IF target.phase = 'preparation'
     AND NOT EXISTS (
       SELECT 1
       FROM public.game_preparation_changes
       WHERE state_set_id = target.id
         AND revision = target.revision
         AND actor_id = target.updated_by
         AND transaction_id = pg_current_xact_id()::text
     ) THEN
    RAISE EXCEPTION 'Preparation value changes require a new audited revision in the same transaction';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS game_kpis_guard ON public.game_kpis;
DROP TRIGGER IF EXISTS game_kpis_delete_guard ON public.game_kpis;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_game_kpi_delete_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) = 'delete' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Game KPI selection is no longer editable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_kpis_guard
BEFORE INSERT OR UPDATE ON public.game_kpis
FOR EACH ROW EXECUTE FUNCTION public.guard_game_kpi();
--> statement-breakpoint
CREATE TRIGGER game_kpis_delete_guard
BEFORE DELETE ON public.game_kpis
FOR EACH ROW EXECUTE FUNCTION public.guard_game_kpi_delete_lifecycle();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_game_period_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nexus.lifecycle_operation', true) = 'delete' THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Period configuration audit is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games
    WHERE id = NEW.game_id
      AND period_revision = NEW.revision
  ) THEN
    RAISE EXCEPTION 'Period audit revision mismatch';
  END IF;

  NEW.transaction_id := pg_current_xact_id()::text;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_game_evaluation_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  total_rounds integer;
  completed_rounds integer;
BEGIN
  IF current_setting('nexus.lifecycle_operation', true) IN ('reset','delete') THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'active'
     AND NEW.status::text = 'evaluation' THEN

    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE status = 'completed')::integer
    INTO
      total_rounds,
      completed_rounds
    FROM public.rounds
    WHERE game_id = NEW.id;

    IF total_rounds = 0 OR completed_rounds <> total_rounds THEN
      RAISE EXCEPTION 'Game evaluation requires all periods to be completed';
    END IF;

  ELSIF OLD.status::text = 'evaluation'
        AND NEW.status::text NOT IN ('evaluation','completed') THEN
    RAISE EXCEPTION 'An evaluated game cannot return to runtime';
  END IF;

  RETURN NEW;
END;
$$;
