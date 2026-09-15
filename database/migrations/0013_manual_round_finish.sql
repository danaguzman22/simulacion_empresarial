-- Allow an authorized application action to finish an active or paused round
-- before its timer expires. Automatic expiry still preserves ends_at.
-- Also fixes the ambiguous period_count reference in the round lifecycle guard.

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
    IF game_status NOT IN ('draft', 'ready')
      OR configured_period_count IS NULL
      OR configured_period_duration IS NULL
      OR NEW.sequence < 1
      OR NEW.sequence > configured_period_count
      OR NEW.duration_seconds IS DISTINCT FROM configured_period_duration
      OR NEW.status <> 'pending'
      OR NEW.created_by IS NULL
      OR NEW.revision <> 0
    THEN
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
  OR NEW.revision <> OLD.revision + 1
  THEN
    RAISE EXCEPTION 'Invalid round identity or revision';
  END IF;

  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN
    RAISE EXCEPTION 'Duration cannot change after period creation';
  END IF;

  manual_finish :=
    NEW.status = 'completed'
    AND NEW.completed_at IS NOT NULL
    AND OLD.status IN ('active', 'paused');

  IF OLD.status IN ('active', 'paused')
    AND NEW.status = 'completed'
  THEN
    IF OLD.status = 'active'
      AND db_now < OLD.ends_at
      AND NOT manual_finish
    THEN
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
        RAISE EXCEPTION 'Earlier rounds must be finished';
      END IF;

      NEW.started_at := db_now;
      NEW.ends_at :=
        db_now + NEW.duration_seconds * interval '1 second';
      NEW.remaining_ms := NULL;
      NEW.paused_at := NULL;
      NEW.completed_at := NULL;

    ELSIF OLD.status = 'active'
      AND NEW.status = 'paused'
    THEN
      IF db_now >= OLD.ends_at THEN
        RAISE EXCEPTION 'Round already expired';
      END IF;

      NEW.remaining_ms :=
        ceil(
          extract(epoch FROM (OLD.ends_at - db_now)) * 1000
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
      RAISE EXCEPTION 'Invalid round transition';
    END IF;
  END IF;

  NEW.updated_at := db_now;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.guard_round_lifecycle()
FROM PUBLIC, anon, authenticated;