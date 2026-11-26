-- 0035 (#106, D-46): archetype of a card (buho, zorro, castor, toro, ardilla or ninguno), in base and game cards.
-- Only adds a nullable column and its CHECK: no existing row is updated. NULL = not set (cards created before 0035);
-- the app deduces it only from the exact visual identity of a NEXUS template, otherwise "ninguno". No UPDATE backfill:
-- guard_role_card freezes the cards of started games and requires a revision bump, and it is never bypassed.
ALTER TABLE "campaign_role_cards" ADD COLUMN "archetype" text;--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD COLUMN "archetype" text;--> statement-breakpoint
ALTER TABLE "campaign_role_cards" ADD CONSTRAINT "campaign_role_cards_archetype_valid" CHECK ("campaign_role_cards"."archetype" is null or "campaign_role_cards"."archetype" in ('buho', 'zorro', 'castor', 'toro', 'ardilla', 'ninguno'));--> statement-breakpoint
ALTER TABLE "game_role_cards" ADD CONSTRAINT "game_role_cards_archetype_valid" CHECK ("game_role_cards"."archetype" is null or "game_role_cards"."archetype" in ('buho', 'zorro', 'castor', 'toro', 'ardilla', 'ninguno'));