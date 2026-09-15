import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, foreignKey, check, index } from "drizzle-orm/pg-core";
import { games } from "./games";
import { campaigns } from "./campaigns";
import { profiles } from "./profiles";
import { gameKpis, kpiOrdinalOptions } from "./preparation";
import { rounds } from "./rounds";

export const gameGoals = pgTable("game_goals", {
  id: uuid("id").defaultRandom().primaryKey(), gameId: uuid("game_id").notNull().references(() => games.id), campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  title: text("title").notNull(), description: text("description"), goalType: text("goal_type").notNull(),
  kpiDefinitionId: uuid("kpi_definition_id"), operator: text("operator"), numericTarget: numeric("numeric_target"), ordinalTargetKey: text("ordinal_target_key"),
  revision: integer("revision").notNull().default(1), createdBy: uuid("created_by").notNull().references(() => profiles.id), updatedBy: uuid("updated_by").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp("updated_at", {withTimezone:true}).notNull().defaultNow(),
  createdDuringRoundId: uuid("created_during_round_id").references(() => rounds.id), createdRoundSequence: integer("created_round_sequence"), createdPeriodLabel: text("created_period_label"),
  fulfilled: boolean("fulfilled"), evaluatedBy: uuid("evaluated_by").references(() => profiles.id), evaluatedAt: timestamp("evaluated_at", {withTimezone:true}), observation: text("observation"), suggestedFulfilled: boolean("suggested_fulfilled"),
}, t => [
  foreignKey({name:"game_goals_selection_fk",columns:[t.gameId,t.kpiDefinitionId],foreignColumns:[gameKpis.gameId,gameKpis.kpiDefinitionId]}),
  foreignKey({name:"game_goals_ordinal_fk",columns:[t.kpiDefinitionId,t.ordinalTargetKey],foreignColumns:[kpiOrdinalOptions.kpiDefinitionId,kpiOrdinalOptions.key]}),
  check("game_goals_type_check",sql`${t.goalType} in ('generic','kpi')`),
  check("game_goals_title_check",sql`length(btrim(${t.title})) between 1 and 160`),
  check("game_goals_description_check",sql`length(${t.description}) <= 4000`),
  check("game_goals_observation_check",sql`length(${t.observation}) <= 4000`),
  check("game_goals_revision_check",sql`${t.revision} > 0`),
  check("game_goals_target_check",sql`(${t.goalType}='generic' and ${t.kpiDefinitionId} is null and ${t.operator} is null and ${t.numericTarget} is null and ${t.ordinalTargetKey} is null) or (${t.goalType}='kpi' and ${t.kpiDefinitionId} is not null and ${t.operator} is not null and ${t.operator} in ('>=','<=','=','>','<','!=') and ((${t.numericTarget} is not null and ${t.ordinalTargetKey} is null and ${t.numericTarget}::text not in ('NaN','Infinity','-Infinity') and abs(${t.numericTarget})<1e24 and ${t.numericTarget}=round(${t.numericTarget},12)) or (${t.numericTarget} is null and ${t.ordinalTargetKey} is not null and ${t.operator}='=')))`),
  check("game_goals_evaluation_check",sql`(${t.fulfilled} is null and ${t.evaluatedBy} is null and ${t.evaluatedAt} is null and ${t.observation} is null and ${t.suggestedFulfilled} is null) or (${t.fulfilled} is not null and ${t.evaluatedBy} is not null and ${t.evaluatedAt} is not null)`),
]).enableRLS();
export const gameGoalChanges = pgTable("game_goal_changes", {
  id: uuid("id").defaultRandom().primaryKey(), operationId: uuid("operation_id").notNull(), gameId: uuid("game_id").notNull(), campaignId: uuid("campaign_id").notNull(), goalId: uuid("goal_id").notNull(), actorId: uuid("actor_id").notNull().references(() => profiles.id),
  operation: text("operation").notNull(), requestHash: text("request_hash").notNull(), before: jsonb("before"), after: jsonb("after"), roundId: uuid("round_id"),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t => [uniqueIndex("game_goal_changes_operation_unique").on(t.operationId),index("game_goal_changes_game_idx").on(t.gameId,t.createdAt)]).enableRLS();
export const gameResults = pgTable("game_results", {
  gameId: uuid("game_id").primaryKey().references(() => games.id), fulfilledCount: integer("fulfilled_count").notNull(), evaluatedCount: integer("evaluated_count").notNull(), category: text("category"),
  createdBy: uuid("created_by").notNull().references(() => profiles.id), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[check("game_results_fulfilled_count_check",sql`${t.fulfilledCount} >= 0`),check("game_results_evaluated_count_check",sql`${t.evaluatedCount} >= ${t.fulfilledCount}`)]).enableRLS();
