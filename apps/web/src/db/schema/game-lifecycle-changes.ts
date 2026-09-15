import { sql } from "drizzle-orm";
import { foreignKey, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { games } from "./games";
import { campaigns } from "./campaigns";
import { profiles } from "./profiles";

export const gameLifecycleChanges = pgTable("game_lifecycle_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id").notNull(),
  gameId: uuid("game_id"),
  campaignId: uuid("campaign_id").notNull(),
  actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  operation: text("operation").notNull(),
  details: jsonb("details").notNull(),
  transactionId: text("transaction_id").notNull().default(sql`pg_current_xact_id()::text`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_lifecycle_changes_operation_unique").on(t.operationId),
  foreignKey({ name: "game_lifecycle_changes_game_fk", columns: [t.gameId], foreignColumns: [games.id] }).onDelete("set null"),
  foreignKey({ name: "game_lifecycle_changes_campaign_fk", columns: [t.campaignId], foreignColumns: [campaigns.id] }).onDelete("restrict"),
]).enableRLS();
