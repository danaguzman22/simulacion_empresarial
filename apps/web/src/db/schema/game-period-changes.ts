import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { games } from "./games";
import { profiles } from "./profiles";
export const gamePeriodChanges = pgTable("game_period_changes", {
 id: uuid("id").defaultRandom().primaryKey(),
 gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "restrict" }),
 operationId: uuid("operation_id").notNull(),
 actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
 revision: integer("revision").notNull(),
 requestHash: text("request_hash").notNull(),
 details: jsonb("details").notNull(),
 transactionId: text("transaction_id").notNull().default(sql`pg_current_xact_id()::text`),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("game_period_changes_operation_unique").on(t.operationId), uniqueIndex("game_period_changes_revision_unique").on(t.gameId, t.revision)]).enableRLS();
