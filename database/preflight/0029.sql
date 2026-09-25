-- Read only. Run separately for review; this file applies no migration.
SELECT to_regclass('public.game_card_assignments') AS assignments;
SELECT to_regclass('public.game_role_cards') AS cards, to_regclass('public.profiles') AS profiles;
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user;
SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT count(*) AS existing_cards FROM public.game_role_cards;
-- 0029 performs no backfill and changes no existing card content.
