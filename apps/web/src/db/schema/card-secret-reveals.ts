import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { gameRoleCards } from "./role-cards";
export const cardSecretReveals = pgTable("card_secret_reveals", {
  id: uuid("id").defaultRandom().primaryKey(), operationId: uuid("operation_id").notNull(),
  gameId: uuid("game_id").notNull(), campaignId: uuid("campaign_id").notNull(), cardId: uuid("card_id").notNull(),
  actorId: uuid("actor_id").notNull().references(() => profiles.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  discardedAt: timestamp("discarded_at", { withTimezone: true }),
}, t => [uniqueIndex("card_secret_reveals_operation_unique").on(t.operationId),
  index("card_secret_reveals_card_current_idx").on(t.cardId).where(sql`${t.discardedAt} is null`),
  index("card_secret_reveals_actor_current_idx").on(t.cardId, t.actorId, t.expiresAt).where(sql`${t.discardedAt} is null`),
  foreignKey({ name: "card_secret_reveals_card_fk", columns: [t.cardId, t.gameId, t.campaignId], foreignColumns: [gameRoleCards.id, gameRoleCards.gameId, gameRoleCards.campaignId] }).onDelete("cascade"),
  check("card_secret_reveals_window_valid", sql`${t.expiresAt} > ${t.startedAt} and (${t.discardedAt} is null or ${t.discardedAt} >= ${t.startedAt})`),
]).enableRLS();
