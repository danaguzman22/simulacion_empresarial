import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { games } from "./games";
import { gameKpis, kpiDefinitions, gameStateSets } from "./preparation";
import { rounds } from "./rounds";
import { profiles } from "./profiles";

export const gameKpiChanges = pgTable("game_kpi_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id").notNull(),
  gameId: uuid("game_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  stateSetId: uuid("state_set_id").notNull(),
  roundId: uuid("round_id").notNull(),
  kpiDefinitionId: uuid("kpi_definition_id").notNull(),
  actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  operation: text("operation").notNull().default("update"),
  requestHash: text("request_hash").notNull(),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  transactionId: text("transaction_id").notNull().default(sql`pg_current_xact_id()::text`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_kpi_changes_operation_unique").on(t.operationId),
  uniqueIndex("game_kpi_changes_state_revision_unique").on(t.stateSetId, t.revision),
  index("game_kpi_changes_game_round_idx").on(t.gameId, t.roundId, t.createdAt),
  index("game_kpi_changes_game_kpi_idx").on(t.gameId, t.kpiDefinitionId, t.createdAt),
  foreignKey({ name: "game_kpi_changes_game_campaign_fk", columns: [t.gameId, t.campaignId], foreignColumns: [games.id, games.campaignId] }).onDelete("restrict"),
  foreignKey({ name: "game_kpi_changes_state_game_campaign_fk", columns: [t.stateSetId, t.gameId, t.campaignId], foreignColumns: [gameStateSets.id, gameStateSets.gameId, gameStateSets.campaignId] }).onDelete("restrict"),
  foreignKey({ name: "game_kpi_changes_round_game_campaign_fk", columns: [t.roundId, t.gameId, t.campaignId], foreignColumns: [rounds.id, rounds.gameId, rounds.campaignId] }).onDelete("restrict"),
  foreignKey({ name: "game_kpi_changes_kpi_game_campaign_fk", columns: [t.gameId, t.kpiDefinitionId, t.campaignId], foreignColumns: [gameKpis.gameId, gameKpis.kpiDefinitionId, gameKpis.campaignId] }).onDelete("restrict"),
  foreignKey({ name: "game_kpi_changes_definition_campaign_fk", columns: [t.kpiDefinitionId, t.campaignId], foreignColumns: [kpiDefinitions.id, kpiDefinitions.campaignId] }).onDelete("restrict"),
  check("game_kpi_changes_operation_valid", sql`${t.operation} = 'update'`),
  check("game_kpi_changes_revision_positive", sql`${t.revision} > 0`),
  check("game_kpi_changes_before_object", sql`jsonb_typeof(${t.before}) = 'object'`),
  check("game_kpi_changes_after_object", sql`jsonb_typeof(${t.after}) = 'object'`),
]).enableRLS();
