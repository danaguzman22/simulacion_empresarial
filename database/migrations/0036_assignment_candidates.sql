-- 0036: who can be added to a game's teams, for the Equipos picker (name and e-mail), and D-48: the Master,
-- Co-Master and Observer of a campaign are never members of its games.
-- No table, column or row changes: it ADDS one read-only function and REPLACES the assignment guard (0029) with
-- the same rules plus one more check on INSERT. Rows that already exist are not touched.
--
-- game_assignment_candidates: the e-mail lives in auth.users, which the app cannot read; like
-- find_registered_profile_by_email (0029), a narrow SECURITY DEFINER function returns only what the picker needs,
-- and only to whoever can edit that game's teams:
-- - the actor is the Master of the game's campaign and an active member of the company's institution;
-- - the game still accepts members (draft, ready, active or paused, same as canManageAssignments);
-- - candidates are the ACTIVE members of the company's institution not yet in this game and without a role in
--   its campaign (D-48).
-- Anyone else gets an empty list. Executable only by service_role (the app server), never by anon/authenticated.
CREATE FUNCTION public.game_assignment_candidates(target_game uuid, actor uuid)
RETURNS TABLE(profile_id uuid, display_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.display_name, u.email::text
  FROM public.games g
  JOIN public.campaigns c ON c.id = g.campaign_id
  JOIN public.companies co ON co.id = c.company_id
  JOIN public.institution_members m ON m.institution_id = co.institution_id AND m.status = 'active'
  JOIN public.profiles p ON p.id = m.profile_id
  JOIN auth.users u ON u.id = p.id
  WHERE g.id = target_game
    AND g.status::text IN ('draft', 'ready', 'active', 'paused')
    AND EXISTS (SELECT 1 FROM public.campaign_members cm WHERE cm.campaign_id = g.campaign_id AND cm.profile_id = actor AND cm.role = 'master')
    AND EXISTS (SELECT 1 FROM public.institution_members am WHERE am.institution_id = co.institution_id AND am.profile_id = actor AND am.status = 'active')
    AND NOT EXISTS (SELECT 1 FROM public.game_card_assignments a WHERE a.game_id = g.id AND a.profile_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.campaign_members staff WHERE staff.campaign_id = g.campaign_id AND staff.profile_id = p.id)
  ORDER BY p.display_name, u.email
  LIMIT 1000
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.game_assignment_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.game_assignment_candidates(uuid, uuid) TO service_role;
--> statement-breakpoint
-- Same guard as 0029, word for word, plus D-48 on INSERT: whoever has a role in the campaign (Master, Co-Master or
-- Observer) cannot be added to its games. UPDATE cannot change profile_id (identity is immutable), so INSERT is
-- the only way in. The trigger (0029) keeps pointing to this function; nothing else changes.
CREATE OR REPLACE FUNCTION public.guard_game_card_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_game uuid; target_campaign uuid; game_status text;
BEGIN
  target_game := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  SELECT campaign_id INTO target_campaign FROM public.games WHERE id=target_game;
  PERFORM 1 FROM public.campaigns WHERE id=target_campaign FOR UPDATE;
  SELECT status::text INTO game_status FROM public.games WHERE id=target_game FOR UPDATE;
  IF TG_OP='DELETE' AND public.lifecycle_mutation_allowed(target_game, ARRAY['delete']) THEN RETURN OLD; END IF;
  IF game_status IS NULL OR game_status NOT IN ('draft','ready','active','paused') THEN
    RAISE EXCEPTION 'Assignments are locked for this game';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.game_id<>OLD.game_id OR NEW.campaign_id<>OLD.campaign_id OR NEW.profile_id<>OLD.profile_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN
    RAISE EXCEPTION 'Assignment identity is immutable and revision must advance';
  END IF;
  IF TG_OP='INSERT' AND NEW.revision<>0 THEN RAISE EXCEPTION 'Initial assignment revision must be zero'; END IF;
  IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM public.campaign_members cm WHERE cm.campaign_id=target_campaign AND cm.profile_id=NEW.profile_id) THEN
    RAISE EXCEPTION 'CAMPAIGN_STAFF_CANNOT_BE_MEMBER';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
