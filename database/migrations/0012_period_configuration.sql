-- 0012 bridges the already-applied old round lifecycle
-- to the new preconfigured-period model.
--
-- It preserves existing rounds and round_changes.
-- It does not infer a period plan for already-started games.

DO $$
BEGIN
  IF to_regclass('public.rounds') IS NULL
    OR to_regclass('public.round_changes') IS NULL
  THEN
    RAISE EXCEPTION
      '0012 requires the previously applied round lifecycle';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'ends_at'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'paused_at'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'remaining_ms'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'revision'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'campaign_id'
  )
  THEN
    RAISE EXCEPTION
      'Existing round lifecycle is incomplete; review before 0012';
  END IF;

  -- The new runtime no longer supports set_duration.
  -- Do not silently rewrite historical audit rows.
  IF EXISTS (
    SELECT 1
    FROM public.round_changes
    WHERE operation = 'set_duration'
  )
  THEN
    RAISE EXCEPTION
      'Historical set_duration audit rows require explicit review before 0012';
  END IF;
END;
$$;

--> statement-breakpoint

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS period_count integer;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS period_label text;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS period_duration_seconds integer;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS period_revision integer DEFAULT 0 NOT NULL;

--> statement-breakpoint

ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_period_configuration_valid;

ALTER TABLE public.games
  ADD CONSTRAINT games_period_configuration_valid
  CHECK (
    (
      period_count IS NULL
      AND period_label IS NULL
      AND period_duration_seconds IS NULL
    )
    OR
    (
      period_count IS NOT NULL
      AND period_count > 0
      AND period_label IS NOT NULL
      AND length(trim(period_label)) BETWEEN 1 AND 80
      AND period_duration_seconds IS NOT NULL
      AND period_duration_seconds > 0
    )
  );

--> statement-breakpoint

ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_period_revision_valid;

ALTER TABLE public.games
  ADD CONSTRAINT games_period_revision_valid
  CHECK (period_revision >= 0);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.game_period_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  game_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  revision integer NOT NULL,
  request_hash text NOT NULL,
  details jsonb NOT NULL,
  transaction_id text DEFAULT pg_current_xact_id()::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE public.game_period_changes ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.game_period_changes'::regclass
      AND conname = 'game_period_changes_game_id_games_id_fk'
  )
  THEN
    ALTER TABLE public.game_period_changes
      ADD CONSTRAINT game_period_changes_game_id_games_id_fk
      FOREIGN KEY (game_id)
      REFERENCES public.games(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.game_period_changes'::regclass
      AND conname = 'game_period_changes_actor_id_profiles_id_fk'
  )
  THEN
    ALTER TABLE public.game_period_changes
      ADD CONSTRAINT game_period_changes_actor_id_profiles_id_fk
      FOREIGN KEY (actor_id)
      REFERENCES public.profiles(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS
  game_period_changes_operation_unique
ON public.game_period_changes(operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS
  game_period_changes_revision_unique
ON public.game_period_changes(game_id, revision);

--> statement-breakpoint

REVOKE ALL
ON public.game_period_changes
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT
ON public.game_period_changes
TO service_role;

--> statement-breakpoint

-- Runtime duration changes are no longer part of the new model.
ALTER TABLE public.round_changes
  DROP CONSTRAINT IF EXISTS round_changes_operation_valid;

ALTER TABLE public.round_changes
  ADD CONSTRAINT round_changes_operation_valid
  CHECK (
    operation IN (
      'create',
      'start',
      'pause',
      'resume',
      'finish'
    )
  );

--> statement-breakpoint

-- Replace the old progressive-round lifecycle.
-- New rounds may only be inserted while the game is draft/ready
-- and must match the game's preconfigured period plan.
CREATE OR REPLACE FUNCTION public.guard_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  game_status text;
  period_count integer;
  period_duration integer;
  db_now timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Round deletion is not supported';
  END IF;

  SELECT
    status::text,
    period_count,
    period_duration_seconds
  INTO
    game_status,
    period_count,
    period_duration
  FROM public.games
  WHERE id = NEW.game_id
  FOR UPDATE;

  db_now := clock_timestamp();

  IF TG_OP = 'INSERT' THEN
    IF game_status NOT IN ('draft', 'ready')
      OR period_count IS NULL
      OR period_duration IS NULL
      OR NEW.sequence < 1
      OR NEW.sequence > period_count
      OR NEW.duration_seconds IS DISTINCT FROM period_duration
      OR NEW.status <> 'pending'
      OR NEW.created_by IS NULL
      OR NEW.revision <> 0
    THEN
      RAISE EXCEPTION
        'Invalid new round';
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
  OR NEW.revision <> OLD.revision + 1
  THEN
    RAISE EXCEPTION
      'Invalid round identity or revision';
  END IF;

  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN
    RAISE EXCEPTION
      'Duration cannot change after period creation';
  END IF;

  IF OLD.status = 'active'
    AND NEW.status = 'completed'
  THEN
    IF db_now < OLD.ends_at THEN
      RAISE EXCEPTION
        'Round has not expired';
    END IF;

    NEW.completed_at := OLD.ends_at;
    NEW.ends_at := NULL;
    NEW.remaining_ms := NULL;
    NEW.paused_at := NULL;
    NEW.started_at := OLD.started_at;

  ELSE
    IF game_status <> 'active' THEN
      RAISE EXCEPTION
        'Game must be active';
    END IF;

    IF OLD.status = 'pending'
      AND NEW.status = 'active'
    THEN
      IF EXISTS (
        SELECT 1
        FROM public.rounds
        WHERE game_id = NEW.game_id
          AND sequence < NEW.sequence
          AND status <> 'completed'
      )
      THEN
        RAISE EXCEPTION
          'Earlier rounds must be finished';
      END IF;

      NEW.started_at := db_now;
      NEW.ends_at :=
        db_now
        + NEW.duration_seconds * interval '1 second';
      NEW.remaining_ms := NULL;
      NEW.paused_at := NULL;
      NEW.completed_at := NULL;

    ELSIF OLD.status = 'active'
      AND NEW.status = 'paused'
    THEN
      IF db_now >= OLD.ends_at THEN
        RAISE EXCEPTION
          'Round already expired';
      END IF;

      NEW.remaining_ms :=
        ceil(
          extract(
            epoch FROM (OLD.ends_at - db_now)
          ) * 1000
        );

      NEW.ends_at := NULL;
      NEW.paused_at := db_now;
      NEW.started_at := OLD.started_at;
      NEW.completed_at := NULL;

    ELSIF OLD.status = 'paused'
      AND NEW.status = 'active'
    THEN
      NEW.ends_at :=
        db_now
        + OLD.remaining_ms * interval '1 millisecond';

      NEW.remaining_ms := NULL;
      NEW.paused_at := NULL;
      NEW.started_at := OLD.started_at;
      NEW.completed_at := NULL;

    ELSE
      RAISE EXCEPTION
        'Invalid round transition';
    END IF;
  END IF;

  NEW.updated_at := db_now;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_round_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION
      'Round audit is immutable';
  END IF;

  IF NEW.operation = 'set_duration' THEN
    RAISE EXCEPTION
      'Runtime duration changes are no longer supported';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rounds
    WHERE id = NEW.round_id
      AND revision = NEW.revision
  )
  OR (
    NEW.operation <> 'finish'
    AND NEW.actor_id IS NULL
  )
  THEN
    RAISE EXCEPTION
      'Round audit revision/actor mismatch';
  END IF;

  NEW.transaction_id :=
    pg_current_xact_id()::text;

  NEW.created_at :=
    clock_timestamp();

  RETURN NEW;
END;
$$;

--> statement-breakpoint

-- Game period configuration can only change before start.
CREATE OR REPLACE FUNCTION public.guard_game_period_configuration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.period_count IS NOT NULL
      OR NEW.period_label IS NOT NULL
      OR NEW.period_duration_seconds IS NOT NULL
      OR NEW.period_revision <> 0
    THEN
      RAISE EXCEPTION
        'Configure periods through a revision after game creation';
    END IF;

    RETURN NEW;
  END IF;

  IF ROW(
    NEW.period_count,
    NEW.period_label,
    NEW.period_duration_seconds,
    NEW.period_revision
  ) IS DISTINCT FROM ROW(
    OLD.period_count,
    OLD.period_label,
    OLD.period_duration_seconds,
    OLD.period_revision
  )
  THEN
    IF OLD.status NOT IN ('draft', 'ready')
      OR NEW.status NOT IN ('draft', 'ready')
      OR OLD.started_at IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.game_state_sets
        WHERE game_id = OLD.id
          AND (
            phase <> 'preparation'
            OR frozen_at IS NOT NULL
          )
      )
    THEN
      RAISE EXCEPTION
        'Period configuration is locked';
    END IF;

    IF NEW.period_revision <> OLD.period_revision + 1 THEN
      RAISE EXCEPTION
        'Invalid period configuration revision';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS
  games_period_configuration_guard
ON public.games;

CREATE TRIGGER
  games_period_configuration_guard
BEFORE INSERT OR UPDATE
ON public.games
FOR EACH ROW
EXECUTE FUNCTION
  public.guard_game_period_configuration();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_game_period_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION
      'Period configuration audit is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games
    WHERE id = NEW.game_id
      AND period_revision = NEW.revision
  )
  THEN
    RAISE EXCEPTION
      'Period audit revision mismatch';
  END IF;

  NEW.transaction_id :=
    pg_current_xact_id()::text;

  NEW.created_at :=
    clock_timestamp();

  RETURN NEW;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS
  game_period_changes_guard
ON public.game_period_changes;

CREATE TRIGGER
  game_period_changes_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.game_period_changes
FOR EACH ROW
EXECUTE FUNCTION
  public.guard_game_period_change();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.check_game_period_audited()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.period_revision <> OLD.period_revision
    AND NOT EXISTS (
      SELECT 1
      FROM public.game_period_changes
      WHERE game_id = NEW.id
        AND revision = NEW.period_revision
        AND transaction_id =
          pg_current_xact_id()::text
    )
  THEN
    RAISE EXCEPTION
      'Period configuration requires transactional audit';
  END IF;

  RETURN NULL;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS
  games_period_audited
ON public.games;

CREATE CONSTRAINT TRIGGER
  games_period_audited
AFTER UPDATE
ON public.games
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION
  public.check_game_period_audited();

--> statement-breakpoint

-- All configured periods must be created atomically
-- during the start_game transaction.
CREATE OR REPLACE FUNCTION public.check_game_start_periods()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  g public.games%ROWTYPE;
  target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'games' THEN
    IF NEW.status <> 'active'
      OR OLD.status NOT IN ('draft', 'ready')
    THEN
      RETURN NULL;
    END IF;

    target_id := NEW.id;
  ELSE
    target_id := NEW.game_id;
  END IF;

  SELECT *
  INTO g
  FROM public.games
  WHERE id = target_id;

  IF g.status <> 'active'
    OR g.period_count IS NULL
    OR g.period_duration_seconds IS NULL
  THEN
    RAISE EXCEPTION
      'Starting game requires period configuration';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.game_preparation_changes c
    JOIN public.game_state_sets s
      ON s.id = c.state_set_id
    WHERE s.game_id = g.id
      AND c.operation = 'start_game'
      AND c.transaction_id =
        pg_current_xact_id()::text
  )
  THEN
    RAISE EXCEPTION
      'Periods may only be created in the start transaction';
  END IF;

  IF (
    SELECT count(*)
    FROM public.rounds
    WHERE game_id = g.id
  ) <> g.period_count
  OR EXISTS (
    SELECT 1
    FROM public.rounds
    WHERE game_id = g.id
      AND (
        sequence < 1
        OR sequence > g.period_count
        OR status <> 'pending'
        OR duration_seconds <>
          g.period_duration_seconds
        OR campaign_id <> g.campaign_id
      )
  )
  THEN
    RAISE EXCEPTION
      'Start must create exactly all configured pending periods';
  END IF;

  RETURN NULL;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS
  games_start_periods
ON public.games;

CREATE CONSTRAINT TRIGGER
  games_start_periods
AFTER UPDATE
ON public.games
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION
  public.check_game_start_periods();

--> statement-breakpoint

DROP TRIGGER IF EXISTS
  rounds_start_transaction
ON public.rounds;

CREATE CONSTRAINT TRIGGER
  rounds_start_transaction
AFTER INSERT
ON public.rounds
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION
  public.check_game_start_periods();

--> statement-breakpoint

REVOKE ALL ON FUNCTION
  public.guard_game_period_configuration(),
  public.guard_game_period_change(),
  public.check_game_period_audited(),
  public.check_game_start_periods(),
  public.guard_round_lifecycle(),
  public.guard_round_change()
FROM PUBLIC, anon, authenticated;