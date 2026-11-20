ALTER TABLE "game_preparation_changes" DROP CONSTRAINT "game_preparation_changes_operation_valid";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "goals_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "rules_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_preparation_changes" ADD CONSTRAINT "game_preparation_changes_operation_valid" CHECK ("game_preparation_changes"."operation" in ('save_values', 'copy_snapshot', 'create_kpi', 'add_kpi', 'remove_kpi', 'set_required', 'edit_kpi', 'delete_kpi', 'start_game', 'set_section_required'));--> statement-breakpoint
-- D-33 (#71): games that already exist in preparation keep goals optional, so their behavior does not change.
-- New games use the column defaults: goals required, rules optional. Started or finished games are not touched.
UPDATE public.games SET goals_required = false WHERE status IN ('draft', 'ready');
--> statement-breakpoint
-- The switches change only while the game is in preparation (same lock as the period configuration).
CREATE FUNCTION public.guard_game_section_requirements() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.goals_required, NEW.rules_required) IS NOT DISTINCT FROM ROW(OLD.goals_required, OLD.rules_required) THEN RETURN NEW; END IF;
 IF OLD.status NOT IN ('draft','ready') OR NEW.status NOT IN ('draft','ready') OR OLD.started_at IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.game_state_sets WHERE game_id = OLD.id AND (phase <> 'preparation' OR frozen_at IS NOT NULL))
 THEN RAISE EXCEPTION 'Section requirements are editable only in preparation'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER games_section_requirements_guard BEFORE UPDATE OF goals_required, rules_required ON public.games FOR EACH ROW EXECUTE FUNCTION public.guard_game_section_requirements();
--> statement-breakpoint
-- Every change needs, in the same transaction, a preparation audit row by a Master or Co-Master of the campaign
-- whose details record the new values ({"goalsRequired": bool, "rulesRequired": bool}).
CREATE FUNCTION public.check_game_section_requirements_audited() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.goals_required, NEW.rules_required) IS DISTINCT FROM ROW(OLD.goals_required, OLD.rules_required) AND NOT EXISTS(
   SELECT 1 FROM public.game_preparation_changes c
   JOIN public.game_state_sets s ON s.id = c.state_set_id AND s.campaign_id = c.campaign_id
   JOIN public.campaign_members m ON m.campaign_id = c.campaign_id AND m.profile_id = c.actor_id AND m.role IN ('master','co_master')
   WHERE s.game_id = NEW.id AND s.phase = 'preparation' AND c.operation = 'set_section_required'
     AND c.transaction_id = pg_current_xact_id()::text
     AND (c.details->>'goalsRequired')::boolean IS NOT DISTINCT FROM NEW.goals_required
     AND (c.details->>'rulesRequired')::boolean IS NOT DISTINCT FROM NEW.rules_required)
 THEN RAISE EXCEPTION 'Section requirement changes require a Master or Co-Master audit in the same transaction'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER games_section_requirements_audited AFTER UPDATE ON public.games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_game_section_requirements_audited();
--> statement-breakpoint
-- A required section that is empty blocks the start (verified here as well as in the server).
-- Goals: at least one goal. Rules: at least one enabled rule.
CREATE FUNCTION public.check_start_section_requirements() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status = 'active' AND OLD.status IN ('draft','ready') THEN
  IF NEW.goals_required AND NOT EXISTS(SELECT 1 FROM public.game_goals WHERE game_id = NEW.id)
  THEN RAISE EXCEPTION 'Start requires at least one goal while goals are required'; END IF;
  IF NEW.rules_required AND NOT EXISTS(SELECT 1 FROM public.game_rules WHERE game_id = NEW.id AND enabled)
  THEN RAISE EXCEPTION 'Start requires at least one enabled rule while rules are required'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER games_section_requirements_start AFTER UPDATE ON public.games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_start_section_requirements();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_game_section_requirements(), public.check_game_section_requirements_audited(), public.check_start_section_requirements() FROM PUBLIC, anon, authenticated;
