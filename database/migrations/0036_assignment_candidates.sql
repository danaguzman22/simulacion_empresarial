-- 0036: who can be added to a game's teams, for the Equipos picker (name and e-mail).
-- Only ADDS one read-only function: no table, column or row changes. The e-mail lives in auth.users, which the app
-- cannot read; like find_registered_profile_by_email (0029), a narrow SECURITY DEFINER function returns only what
-- the picker needs, and only to whoever can edit that game's teams:
-- - the actor is the Master of the game's campaign and an active member of the company's institution;
-- - the game still accepts members (draft, ready, active or paused, same as canManageAssignments);
-- - candidates are the ACTIVE members of the company's institution not yet in this game.
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
  ORDER BY p.display_name, u.email
  LIMIT 1000
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.game_assignment_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.game_assignment_candidates(uuid, uuid) TO service_role;
