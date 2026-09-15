-- Reconcile legacy games that completed every existing period before evaluation existed.
UPDATE public.games AS g
SET status = 'evaluation',
    updated_at = clock_timestamp()
WHERE g.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.rounds AS r
    WHERE r.game_id = g.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.rounds AS r
    WHERE r.game_id = g.id
      AND r.status <> 'completed'
  );
--> statement-breakpoint
CREATE FUNCTION public.guard_game_evaluation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  total_rounds integer;
  completed_rounds integer;
BEGIN
  IF OLD.status::text = 'active' AND NEW.status::text = 'evaluation' THEN
    SELECT count(*)::integer, count(*) FILTER (WHERE status = 'completed')::integer
    INTO total_rounds, completed_rounds
    FROM public.rounds
    WHERE game_id = NEW.id;
    IF total_rounds = 0 OR completed_rounds <> total_rounds THEN
      RAISE EXCEPTION 'Game evaluation requires all periods to be completed';
    END IF;
  ELSIF OLD.status::text = 'evaluation' AND NEW.status::text NOT IN ('evaluation', 'completed') THEN
    RAISE EXCEPTION 'An evaluated game cannot return to runtime';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER games_evaluation_transition_guard
BEFORE UPDATE OF status ON public.games
FOR EACH ROW EXECUTE FUNCTION public.guard_game_evaluation_transition();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_game_evaluation_transition() FROM PUBLIC, anon, authenticated;