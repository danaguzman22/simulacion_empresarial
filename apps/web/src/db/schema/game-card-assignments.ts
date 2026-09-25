import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, timestamp, foreignKey, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { gameRoleCards } from "./role-cards";

export const gameCardAssignments = pgTable("game_card_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  cardId: uuid("card_id").notNull(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id),
  updatedBy: uuid("updated_by").notNull().references(() => profiles.id),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("game_card_assignments_game_profile_unique").on(t.gameId, t.profileId),
  index("game_card_assignments_profile_index").on(t.profileId),
  index("game_card_assignments_card_index").on(t.cardId),
  foreignKey({ name: "game_card_assignments_card_fk", columns: [t.cardId, t.gameId, t.campaignId], foreignColumns: [gameRoleCards.id, gameRoleCards.gameId, gameRoleCards.campaignId] }).onDelete("cascade"),
  check("game_card_assignments_revision_valid", sql`${t.revision} >= 0`),
]).enableRLS();
