-- #29: rule effects reported "Situation effect ..." errors (0024). Only the messages change:
-- same bodies, signatures, owners, grants and triggers (CREATE OR REPLACE keeps the function OIDs). No data is touched.
CREATE OR REPLACE FUNCTION public.check_current_kpi_value_audited() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.game_state_sets%ROWTYPE; audit public.game_kpi_changes%ROWTYPE; target_id uuid; kpi_id uuid;
BEGIN
 IF public.lifecycle_mutation_allowed(CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END,ARRAY['reset','delete']) THEN RETURN NULL; END IF;
 target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.state_set_id ELSE NEW.state_set_id END;
 kpi_id:=CASE WHEN TG_OP='DELETE' THEN OLD.kpi_definition_id ELSE NEW.kpi_definition_id END;
 SELECT * INTO target FROM public.game_state_sets WHERE id=target_id;
 IF target.phase='current' AND NOT(TG_OP='INSERT' AND target.created_at=transaction_timestamp()) THEN
  SELECT * INTO audit FROM public.game_kpi_changes WHERE state_set_id=target_id AND revision=target.revision AND kpi_definition_id=kpi_id AND transaction_id=pg_current_xact_id()::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current KPI value change requires an audit record in the same transaction'; END IF;
  IF audit.source IN ('situation','rule') AND (TG_OP<>'UPDATE' OR OLD.ordinal_key IS NOT NULL OR NEW.ordinal_key IS NOT NULL
    OR (audit.before->>'value')::numeric IS DISTINCT FROM OLD.value OR (audit.after->>'value')::numeric IS DISTINCT FROM NEW.value)
  THEN RAISE EXCEPTION '% effect does not match the actual value change', CASE WHEN audit.source='rule' THEN 'Rule' ELSE 'Situation' END; END IF;
 END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_rule_effect_applied() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source='rule' AND NOT COALESCE(public.lifecycle_mutation_allowed(NEW.game_id,ARRAY['reset','delete']),false) AND NOT EXISTS(
   SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=NEW.state_set_id AND v.kpi_definition_id=NEW.kpi_definition_id
   AND v.xmin::text::bigint = mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND v.value=(NEW.after->>'value')::numeric)
 THEN RAISE EXCEPTION 'Rule effect requires a value write in the same transaction'; END IF;
 RETURN NULL;
END; $$;
