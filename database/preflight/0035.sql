-- Read-only preflight for 0035_card_archetype (#106, D-46). Run before applying; it changes nothing.
-- 0035 only ADDS the nullable column "archetype" (with a CHECK) to campaign_role_cards and game_role_cards.
-- No row is updated: existing cards keep archetype NULL and the app deduces it on read (exact template text only).
-- 1. Expected empty: the column and the constraints do not exist yet.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('campaign_role_cards', 'game_role_cards') AND column_name = 'archetype';
SELECT conname FROM pg_constraint WHERE conname IN ('campaign_role_cards_archetype_valid', 'game_role_cards_archetype_valid');
-- 2. Cards that exist today and what the app will show for each one after 0035 (same rule as resolveArchetype):
--    exact visual identity of a template (case and extra spaces ignored) or its emoji alone; anything else = ninguno.
WITH cards AS (
  SELECT 'base' AS kind, visual_identity FROM public.campaign_role_cards
  UNION ALL SELECT 'partida', visual_identity FROM public.game_role_cards
), deduced AS (
  SELECT kind, visual_identity, CASE lower(regexp_replace(btrim(visual_identity), '\s+', ' ', 'g'))
    WHEN 'el búho' THEN 'buho' WHEN '🦉' THEN 'buho'
    WHEN 'el zorro' THEN 'zorro' WHEN '🦊' THEN 'zorro'
    WHEN 'el castor' THEN 'castor' WHEN '🦫' THEN 'castor'
    WHEN 'el toro' THEN 'toro' WHEN '🐂' THEN 'toro'
    WHEN 'la ardilla' THEN 'ardilla' WHEN '🐿️' THEN 'ardilla' WHEN '🐿' THEN 'ardilla'
    ELSE 'ninguno' END AS archetype
  FROM cards
)
SELECT kind, archetype, visual_identity, count(*) FROM deduced GROUP BY kind, archetype, visual_identity ORDER BY kind, archetype, visual_identity;
-- 3. For reference: cards of started or frozen games (guard_role_card does not let them change; 0035 does not touch them).
SELECT count(*) AS frozen_game_cards FROM public.game_role_cards c JOIN public.games g ON g.id = c.game_id
WHERE g.status::text NOT IN ('draft', 'ready')
   OR EXISTS (SELECT 1 FROM public.game_state_sets s WHERE s.game_id = g.id AND (s.phase <> 'preparation' OR s.frozen_at IS NOT NULL));
