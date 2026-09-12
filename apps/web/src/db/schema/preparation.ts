import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, boolean, check, foreignKey, index, integer, jsonb,
  numeric, primaryKey, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { games } from "./games";
import { profiles } from "./profiles";

export const gameStatePhaseEnum = pgEnum("game_state_phase", [
  "preparation", "initial", "current", "final",
]);

export const kpiValueTypeEnum = pgEnum("kpi_value_type", ["numeric", "ordinal"]);

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
  valueType: kpiValueTypeEnum("value_type").notNull().default("numeric"),
  key: text("key").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  precision: integer("precision").notNull().default(2),
  required: boolean("required").notNull().default(false),
  allowsNegative: boolean("allows_negative").notNull().default(false),
  active: boolean("active").notNull().default(true),
  historicalUsedAt: timestamp("historical_used_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("kpi_definitions_campaign_key_unique").on(t.campaignId, t.key),
  uniqueIndex("kpi_definitions_id_campaign_unique").on(t.id, t.campaignId),
  check("kpi_definitions_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{0,63}$'`),
  check("kpi_definitions_name_nonempty", sql`length(btrim(${t.name})) > 0`),
  check("kpi_definitions_unit_nonempty", sql`length(btrim(${t.unit})) > 0`),
  check("kpi_definitions_precision_range", sql`${t.precision} between 0 and 6`),
]).enableRLS();

export const kpiOrdinalOptions = pgTable("kpi_ordinal_options", {
  kpiDefinitionId: uuid("kpi_definition_id")
    .notNull()
    .references(() => kpiDefinitions.id, { onDelete: "restrict" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
}, (t) => [
  primaryKey({
    columns: [t.kpiDefinitionId, t.key],
    name: "kpi_ordinal_options_pk",
  }),
  uniqueIndex("kpi_ordinal_options_position_unique").on(
    t.kpiDefinitionId,
    t.position
  ),
  check(
    "kpi_ordinal_options_key_format",
    sql`${t.key} ~ '^[a-z][a-z0-9_]{0,63}$'`
  ),
  check(
    "kpi_ordinal_options_label_nonempty",
    sql`length(btrim(${t.label})) > 0`
  ),
  check(
    "kpi_ordinal_options_position_valid",
    sql`${t.position} >= 0`
  ),
]).enableRLS();

export const gameKpis = pgTable("game_kpis", {
  gameId: uuid("game_id").notNull(),
  kpiDefinitionId: uuid("kpi_definition_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  required: boolean("required").notNull().default(false),
  historicalUsedAt: timestamp("historical_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
}, (t) => [
  uniqueIndex("game_kpis_game_kpi_unique").on(
    t.gameId,
    t.kpiDefinitionId
  ),
  uniqueIndex("game_kpis_game_kpi_campaign_unique").on(
    t.gameId,
    t.kpiDefinitionId,
    t.campaignId
  ),
  index("game_kpis_kpi_idx").on(t.kpiDefinitionId),
  foreignKey({
    name: "game_kpis_game_campaign_fk",
    columns: [t.gameId, t.campaignId],
    foreignColumns: [games.id, games.campaignId],
  }).onDelete("restrict"),
  foreignKey({
    name: "game_kpis_definition_campaign_fk",
    columns: [t.kpiDefinitionId, t.campaignId],
    foreignColumns: [kpiDefinitions.id, kpiDefinitions.campaignId],
  }).onDelete("restrict"),
]).enableRLS();

export const gameStateSets = pgTable("game_state_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  gameId: uuid("game_id").notNull(),
  phase: gameStatePhaseEnum("phase").notNull(),
  sourceStateSetId: uuid("source_state_set_id").references(
    (): AnyPgColumn => gameStateSets.id, { onDelete: "restrict" }
  ),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(0),
  createdBy: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  updatedBy: uuid("updated_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("game_state_sets_game_phase_unique").on(t.gameId, t.phase),
  uniqueIndex("game_state_sets_id_campaign_unique").on(t.id, t.campaignId),
  uniqueIndex("game_state_sets_id_game_campaign_unique").on(t.id, t.gameId, t.campaignId),
  index("game_state_sets_campaign_idx").on(t.campaignId),
  index("game_state_sets_source_idx").on(t.sourceStateSetId),
  foreignKey({
    name: "game_state_sets_game_campaign_fk",
    columns: [t.gameId, t.campaignId],
    foreignColumns: [games.id, games.campaignId],
  }).onDelete("restrict"),
  foreignKey({
    name: "game_state_sets_source_campaign_fk",
    columns: [t.sourceStateSetId, t.campaignId],
    foreignColumns: [t.id, t.campaignId],
  }).onDelete("restrict"),
  check("game_state_sets_revision_nonnegative", sql`${t.revision} >= 0`),
  check("game_state_sets_source_not_self", sql`${t.sourceStateSetId} is null or ${t.sourceStateSetId} <> ${t.id}`),
]).enableRLS();

export const gameStateValues = pgTable("game_state_values", {
  gameId: uuid("game_id").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  stateSetId: uuid("state_set_id").notNull(),
  kpiDefinitionId: uuid("kpi_definition_id").notNull(),

  // KPI numérico
  value: numeric("value"),

  // KPI ordinal
  ordinalKey: text("ordinal_key"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [
  uniqueIndex("game_state_values_state_kpi_unique").on(
    t.stateSetId,
    t.kpiDefinitionId
  ),

  index("game_state_values_kpi_idx").on(
    t.kpiDefinitionId
  ),

  foreignKey({
    name: "game_state_values_state_game_campaign_fk",
    columns: [
      t.stateSetId,
      t.gameId,
      t.campaignId,
    ],
    foreignColumns: [
      gameStateSets.id,
      gameStateSets.gameId,
      gameStateSets.campaignId,
    ],
  }).onDelete("restrict"),

  foreignKey({
    name: "game_state_values_game_kpi_fk",
    columns: [
      t.gameId,
      t.kpiDefinitionId,
      t.campaignId,
    ],
    foreignColumns: [
      gameKpis.gameId,
      gameKpis.kpiDefinitionId,
      gameKpis.campaignId,
    ],
  }).onDelete("restrict"),

  foreignKey({
    name: "game_state_values_state_campaign_fk",
    columns: [
      t.stateSetId,
      t.campaignId,
    ],
    foreignColumns: [
      gameStateSets.id,
      gameStateSets.campaignId,
    ],
  }).onDelete("restrict"),

  foreignKey({
    name: "game_state_values_kpi_campaign_fk",
    columns: [
      t.kpiDefinitionId,
      t.campaignId,
    ],
    foreignColumns: [
      kpiDefinitions.id,
      kpiDefinitions.campaignId,
    ],
  }).onDelete("restrict"),

  foreignKey({
    name: "game_state_values_ordinal_option_fk",
    columns: [
      t.kpiDefinitionId,
      t.ordinalKey,
    ],
    foreignColumns: [
      kpiOrdinalOptions.kpiDefinitionId,
      kpiOrdinalOptions.key,
    ],
  }).onDelete("restrict"),

  check(
    "game_state_values_exactly_one_value",
    sql`(${t.value} is not null) <> (${t.ordinalKey} is not null)`
  ),

  check(
    "game_state_values_finite",
    sql`${t.value}::text not in ('NaN', 'Infinity', '-Infinity')`
  ),

  check(
    "game_state_values_magnitude",
    sql`abs(${t.value}) < 1000000000000000000000000::numeric`
  ),
]).enableRLS();

export const gamePreparationChanges = pgTable("game_preparation_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  stateSetId: uuid("state_set_id").notNull(),
  actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  operation: text("operation").notNull(),
  requestHash: text("request_hash").notNull(),
  transactionId: text("transaction_id").notNull().default(sql`pg_current_xact_id()::text`),
  previousRevision: integer("previous_revision").notNull(),
  revision: integer("revision").notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("game_preparation_changes_operation_unique").on(t.operationId),
  uniqueIndex("game_preparation_changes_state_revision_unique").on(t.stateSetId, t.revision),
  index("game_preparation_changes_campaign_idx").on(t.campaignId),
  foreignKey({
    name: "game_preparation_changes_state_campaign_fk",
    columns: [t.stateSetId, t.campaignId],
    foreignColumns: [gameStateSets.id, gameStateSets.campaignId],
  }).onDelete("restrict"),
  check("game_preparation_changes_revision_step", sql`${t.previousRevision} >= 0 and ${t.revision} = ${t.previousRevision} + 1`),
  check("game_preparation_changes_operation_valid", sql`${t.operation} in ('save_values', 'copy_snapshot', 'create_kpi', 'add_kpi', 'remove_kpi', 'set_required', 'edit_kpi', 'delete_kpi')`),
]).enableRLS();
