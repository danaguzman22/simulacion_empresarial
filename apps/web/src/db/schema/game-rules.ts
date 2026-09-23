import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { games } from "./games";
import { profiles } from "./profiles";
import { gameKpis, gameStateSets } from "./preparation";
import { rounds } from "./rounds";

export const gameRules=pgTable("game_rules",{
 id:uuid("id").defaultRandom().primaryKey(),gameId:uuid("game_id").notNull(),campaignId:uuid("campaign_id").notNull(),
 name:text("name").notNull(),description:text("description").notNull().default(""),triggerType:text("trigger_type").notNull().default("round_end"),
 enabled:boolean("enabled").notNull().default(true),position:integer("position").notNull(),revision:integer("revision").notNull().default(0),
 visibility:text("visibility").$type<"display"|"master_only">().notNull().default("display"),displayMessage:text("display_message").notNull().default(""),
 createdBy:uuid("created_by").notNull().references(()=>profiles.id,{onDelete:"restrict"}),updatedBy:uuid("updated_by").notNull().references(()=>profiles.id,{onDelete:"restrict"}),
 createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),updatedAt:timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
 uniqueIndex("game_rules_identity_unique").on(t.id,t.gameId,t.campaignId),
 foreignKey({name:"game_rules_game_fk",columns:[t.gameId,t.campaignId],foreignColumns:[games.id,games.campaignId]}).onDelete("restrict"),
 check("game_rules_valid",sql`length(trim(${t.name})) between 1 and 160 and length(${t.description})<=5000 and length(${t.displayMessage})<=5000 and ${t.triggerType}='round_end' and ${t.visibility} in ('display','master_only') and ${t.position}>=0 and ${t.revision}>=0`),
]).enableRLS();
export const gameRuleEffects=pgTable("game_rule_effects",{
 id:uuid("id").defaultRandom().primaryKey(),ruleId:uuid("rule_id").notNull(),gameId:uuid("game_id").notNull(),campaignId:uuid("campaign_id").notNull(),
 kpiDefinitionId:uuid("kpi_definition_id").notNull(),effectType:text("effect_type").notNull().default("numeric_add"),amount:numeric("amount").notNull(),
},t=>[
 uniqueIndex("game_rule_effects_kpi_unique").on(t.ruleId,t.kpiDefinitionId),
 foreignKey({name:"game_rule_effects_rule_fk",columns:[t.ruleId,t.gameId,t.campaignId],foreignColumns:[gameRules.id,gameRules.gameId,gameRules.campaignId]}).onDelete("restrict"),
 foreignKey({name:"game_rule_effects_kpi_fk",columns:[t.gameId,t.kpiDefinitionId,t.campaignId],foreignColumns:[gameKpis.gameId,gameKpis.kpiDefinitionId,gameKpis.campaignId]}).onDelete("restrict"),
 check("game_rule_effects_valid",sql`${t.effectType}='numeric_add' and ${t.amount}::text not in ('NaN','Infinity','-Infinity') and abs(${t.amount})<1000000000000000000000000::numeric`),
]).enableRLS();
export const gameRuleExecutions=pgTable("game_rule_executions",{
 id:uuid("id").defaultRandom().primaryKey(),ruleId:uuid("rule_id").notNull(),gameId:uuid("game_id").notNull(),campaignId:uuid("campaign_id").notNull(),
 roundId:uuid("round_id").notNull(),stateSetId:uuid("state_set_id").notNull(),closeOperationId:uuid("close_operation_id").notNull(),
 previousRevision:integer("previous_revision").notNull(),revision:integer("revision").notNull(),effectCount:integer("effect_count").notNull(),
 reason:text("reason").$type<"manual"|"timer">().notNull(),actorId:uuid("actor_id").references(()=>profiles.id,{onDelete:"restrict"}),
 executedAt:timestamp("executed_at",{withTimezone:true}).defaultNow().notNull(),transactionId:text("transaction_id").default(sql`pg_current_xact_id()::text`).notNull(),
},t=>[
 uniqueIndex("game_rule_executions_round_unique").on(t.ruleId,t.roundId),uniqueIndex("game_rule_executions_revision_unique").on(t.stateSetId,t.revision),
 foreignKey({name:"game_rule_executions_rule_fk",columns:[t.ruleId,t.gameId,t.campaignId],foreignColumns:[gameRules.id,gameRules.gameId,gameRules.campaignId]}).onDelete("restrict"),
 foreignKey({name:"game_rule_executions_round_fk",columns:[t.roundId,t.gameId,t.campaignId],foreignColumns:[rounds.id,rounds.gameId,rounds.campaignId]}).onDelete("restrict"),
 foreignKey({name:"game_rule_executions_state_fk",columns:[t.stateSetId,t.gameId,t.campaignId],foreignColumns:[gameStateSets.id,gameStateSets.gameId,gameStateSets.campaignId]}).onDelete("restrict"),
 check("game_rule_executions_valid",sql`${t.previousRevision}>=0 and ${t.revision}=${t.previousRevision}+1 and ${t.effectCount}>0 and ((${t.reason}='timer' and ${t.actorId} is null) or (${t.reason}='manual' and ${t.actorId} is not null))`),
]).enableRLS();
