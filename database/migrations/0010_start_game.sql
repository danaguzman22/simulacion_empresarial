ALTER TABLE "game_preparation_changes" DROP CONSTRAINT "game_preparation_changes_operation_valid";--> statement-breakpoint
ALTER TABLE "game_preparation_changes" ADD CONSTRAINT "game_preparation_changes_operation_valid" CHECK ("game_preparation_changes"."operation" in ('save_values', 'copy_snapshot', 'create_kpi', 'add_kpi', 'remove_kpi', 'set_required', 'edit_kpi', 'delete_kpi', 'start_game'));--> statement-breakpoint
-- Only a new activation is checked; future current-state changes are independent.
CREATE FUNCTION public.check_game_start()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  prep public.game_state_sets%ROWTYPE;
  initial_state public.game_state_sets%ROWTYPE;
  current_state public.game_state_sets%ROWTYPE;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft','ready') THEN RETURN NULL; END IF;
  SELECT * INTO prep FROM public.game_state_sets WHERE game_id=NEW.id AND phase='preparation';
  SELECT * INTO initial_state FROM public.game_state_sets WHERE game_id=NEW.id AND phase='initial';
  SELECT * INTO current_state FROM public.game_state_sets WHERE game_id=NEW.id AND phase='current';
  IF NEW.started_at IS NULL OR prep.id IS NULL OR prep.frozen_at IS NULL
    OR initial_state.id IS NULL OR initial_state.frozen_at IS NULL
    OR current_state.id IS NULL OR current_state.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'Starting a game requires frozen preparation/initial and an independent current state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_preparation_changes c
    WHERE c.state_set_id=prep.id AND c.revision=prep.revision AND c.operation='start_game'
      AND c.actor_id=prep.updated_by AND c.transaction_id=pg_current_xact_id()::text) THEN
    RAISE EXCEPTION 'Starting a game requires an audit record in the same transaction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_kpis k WHERE k.game_id=NEW.id AND k.required
    AND NOT EXISTS (SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=prep.id AND v.kpi_definition_id=k.kpi_definition_id)) THEN
    RAISE EXCEPTION 'A required KPI is missing';
  END IF;
  IF EXISTS (
    (SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=prep.id
     EXCEPT SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=initial_state.id)
    UNION ALL
    (SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=initial_state.id
     EXCEPT SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=prep.id)
    UNION ALL
    (SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=initial_state.id
     EXCEPT SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=current_state.id)
    UNION ALL
    (SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=current_state.id
     EXCEPT SELECT kpi_definition_id,value,ordinal_key FROM public.game_state_values WHERE state_set_id=initial_state.id)
  ) THEN RAISE EXCEPTION 'Initial and current must copy preparation exactly at start'; END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER games_start_complete
AFTER INSERT OR UPDATE ON public.games
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_game_start();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.check_game_start() FROM PUBLIC, anon, authenticated;
