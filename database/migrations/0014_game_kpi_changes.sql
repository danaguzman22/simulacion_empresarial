-- Operational KPI changes affect only the live current state.
-- Preparation, initial, and final remain outside this audit stream.
CREATE TABLE public.game_kpi_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  operation_id uuid NOT NULL,
  game_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  state_set_id uuid NOT NULL,
  round_id uuid NOT NULL,
  kpi_definition_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  revision integer NOT NULL,
  operation text NOT NULL DEFAULT 'update',
  request_hash text NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_kpi_changes_operation_valid CHECK (operation = 'update'),
  CONSTRAINT game_kpi_changes_revision_positive CHECK (revision > 0),
  CONSTRAINT game_kpi_changes_before_object CHECK (jsonb_typeof(before) = 'object'),
  CONSTRAINT game_kpi_changes_after_object CHECK (jsonb_typeof(after) = 'object')
);
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_game_campaign_fk
  FOREIGN KEY (game_id, campaign_id) REFERENCES public.games(id, campaign_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_state_game_campaign_fk
  FOREIGN KEY (state_set_id, game_id, campaign_id) REFERENCES public.game_state_sets(id, game_id, campaign_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_round_game_campaign_fk
  FOREIGN KEY (round_id, game_id, campaign_id) REFERENCES public.rounds(id, game_id, campaign_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_kpi_game_campaign_fk
  FOREIGN KEY (game_id, kpi_definition_id, campaign_id) REFERENCES public.game_kpis(game_id, kpi_definition_id, campaign_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_definition_campaign_fk
  FOREIGN KEY (kpi_definition_id, campaign_id) REFERENCES public.kpi_definitions(id, campaign_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.game_kpi_changes
  ADD CONSTRAINT game_kpi_changes_actor_id_profiles_id_fk
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX game_kpi_changes_operation_unique ON public.game_kpi_changes(operation_id);
CREATE UNIQUE INDEX game_kpi_changes_state_revision_unique ON public.game_kpi_changes(state_set_id, revision);
CREATE INDEX game_kpi_changes_game_round_idx ON public.game_kpi_changes(game_id, round_id, created_at);
CREATE INDEX game_kpi_changes_game_kpi_idx ON public.game_kpi_changes(game_id, kpi_definition_id, created_at);
--> statement-breakpoint
REVOKE ALL ON public.game_kpi_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.game_kpi_changes TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_game_kpi_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  game_status text;
  round_status text;
  state_phase text;
  state_revision integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Game KPI audit is immutable';
  END IF;
  IF NEW.operation <> 'update' THEN
    RAISE EXCEPTION 'Invalid game KPI audit operation';
  END IF;
  SELECT status::text INTO game_status FROM public.games WHERE id = NEW.game_id AND campaign_id = NEW.campaign_id;
  SELECT status::text INTO round_status FROM public.rounds WHERE id = NEW.round_id AND game_id = NEW.game_id AND campaign_id = NEW.campaign_id;
  SELECT phase::text, revision INTO state_phase, state_revision FROM public.game_state_sets WHERE id = NEW.state_set_id AND game_id = NEW.game_id AND campaign_id = NEW.campaign_id;
  IF game_status <> 'active' OR round_status NOT IN ('active', 'paused') OR state_phase <> 'current' OR state_revision <> NEW.revision THEN
    RAISE EXCEPTION 'Invalid operational KPI audit context';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_kpis WHERE game_id = NEW.game_id AND kpi_definition_id = NEW.kpi_definition_id AND campaign_id = NEW.campaign_id) THEN
    RAISE EXCEPTION 'Operational KPI is not selected for this game';
  END IF;
  NEW.transaction_id := pg_current_xact_id()::text;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER game_kpi_changes_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.game_kpi_changes
FOR EACH ROW EXECUTE FUNCTION public.guard_game_kpi_change();
--> statement-breakpoint
CREATE FUNCTION public.check_current_kpi_state_audited()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.phase = 'current'
    AND NEW.revision <> OLD.revision
    AND NOT EXISTS (
      SELECT 1 FROM public.game_kpi_changes
      WHERE state_set_id = NEW.id
        AND revision = NEW.revision
        AND transaction_id = pg_current_xact_id()::text
    )
  THEN
    RAISE EXCEPTION 'Current KPI revision requires an audit record in the same transaction';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER game_state_sets_current_kpi_audited
AFTER UPDATE ON public.game_state_sets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_current_kpi_state_audited();
--> statement-breakpoint
CREATE FUNCTION public.check_current_kpi_value_audited()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target_id uuid;
  target_phase text;
  target_revision integer;
  target_created_at timestamptz;
BEGIN
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.state_set_id ELSE NEW.state_set_id END;
  SELECT phase::text, revision, created_at INTO target_phase, target_revision, target_created_at FROM public.game_state_sets WHERE id = target_id;
  IF target_phase = 'current'
    AND NOT (TG_OP = 'INSERT' AND target_created_at = transaction_timestamp())
    AND NOT EXISTS (
      SELECT 1 FROM public.game_kpi_changes
      WHERE state_set_id = target_id
        AND revision = target_revision
        AND transaction_id = pg_current_xact_id()::text
    )
  THEN
    RAISE EXCEPTION 'Current KPI value change requires an audit record in the same transaction';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER game_state_values_current_kpi_audited
AFTER INSERT OR UPDATE OR DELETE ON public.game_state_values
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_current_kpi_value_audited();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_game_kpi_change(), public.check_current_kpi_state_audited(), public.check_current_kpi_value_audited() FROM PUBLIC, anon, authenticated;
