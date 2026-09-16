import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { games } from "./games";
import { rounds } from "./rounds";
import { profiles } from "./profiles";
import { gameStateSets } from "./preparation";

export const gameSituations = pgTable("game_situations", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  roundId: uuid("round_id").notNull(),
  stateSetId: uuid("state_set_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  operationId: uuid("operation_id").notNull(),
  requestHash: text("request_hash").notNull(),
  previousRevision: integer("previous_revision").notNull(),
  revision: integer("revision").notNull(),
  effectCount: integer("effect_count").notNull(),
  visibility: text("visibility").$type<"display" | "master_only">().notNull().default("display"),
  transactionId: text("transaction_id").notNull().default(sql`pg_current_xact_id()::text`),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("game_situations_operation_unique").on(t.operationId),
  index("game_situations_game_time_idx").on(t.gameId, t.publishedAt),
  foreignKey({name:"game_situations_game_fk",columns:[t.gameId,t.campaignId],foreignColumns:[games.id,games.campaignId]}).onDelete("restrict"),
  foreignKey({name:"game_situations_round_fk",columns:[t.roundId,t.gameId,t.campaignId],foreignColumns:[rounds.id,rounds.gameId,rounds.campaignId]}).onDelete("restrict"),
  foreignKey({name:"game_situations_state_fk",columns:[t.stateSetId,t.gameId,t.campaignId],foreignColumns:[gameStateSets.id,gameStateSets.gameId,gameStateSets.campaignId]}).onDelete("restrict"),
  check("game_situations_text_valid",sql`length(trim(${t.title})) between 1 and 160 and length(${t.description}) <= 5000`),
  check("game_situations_visibility_valid",sql`${t.visibility} in ('display','master_only')`),
  check("game_situations_revision_valid",sql`${t.previousRevision} >= 0 and ${t.effectCount} between 0 and 100 and ${t.revision} = ${t.previousRevision} + case when ${t.effectCount} > 0 then 1 else 0 end`),
]).enableRLS();
