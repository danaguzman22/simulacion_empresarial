import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roundStatusEnum } from "./common";
import { games } from "./games";
import { profiles } from "./profiles";
export const rounds = pgTable("rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(()=>games.id,{onDelete:"cascade"}),
  campaignId: uuid("campaign_id").notNull(),
  sequence: integer("sequence").notNull(),
  name: text("name"),
  status: roundStatusEnum("status").default("pending").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  startedAt: timestamp("started_at",{withTimezone:true}),
  endsAt: timestamp("ends_at",{withTimezone:true}),
  pausedAt: timestamp("paused_at",{withTimezone:true}),
  remainingMs: bigint("remaining_ms",{mode:"number"}),
  completedAt: timestamp("completed_at",{withTimezone:true}),
  revision: integer("revision").notNull().default(0),
  createdBy: uuid("created_by").references(()=>profiles.id,{onDelete:"restrict"}),
  createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
  uniqueIndex("rounds_game_sequence_unique").on(t.gameId,t.sequence),
  uniqueIndex("rounds_id_game_campaign_unique").on(t.id,t.gameId,t.campaignId),
  uniqueIndex("rounds_one_execution_unique").on(t.gameId).where(sql`${t.status} in ('active','paused')`),
  index("rounds_game_id_idx").on(t.gameId),index("rounds_status_idx").on(t.status),
  foreignKey({name:"rounds_game_campaign_fk",columns:[t.gameId,t.campaignId],foreignColumns:[games.id,games.campaignId]}).onDelete("restrict"),
  check("rounds_duration_positive",sql`${t.durationSeconds}>0`),
  check("rounds_revision_nonnegative",sql`${t.revision}>=0`),
  check("rounds_clock_shape",sql`(${t.status}='pending' and ${t.startedAt} is null and ${t.endsAt} is null and ${t.remainingMs} is null and ${t.completedAt} is null) or (${t.status}='active' and ${t.startedAt} is not null and ${t.endsAt} is not null and ${t.pausedAt} is null and ${t.remainingMs} is null and ${t.completedAt} is null) or (${t.status}='paused' and ${t.startedAt} is not null and ${t.endsAt} is null and ${t.pausedAt} is not null and ${t.remainingMs} is not null and ${t.remainingMs}>0 and ${t.completedAt} is null) or (${t.status}='completed' and ${t.startedAt} is not null and ${t.completedAt} is not null and ${t.endsAt} is null and ${t.remainingMs} is null) or ${t.status}='cancelled'`),
]).enableRLS();
export const roundChanges=pgTable("round_changes",{
 id:uuid("id").defaultRandom().primaryKey(),operationId:uuid("operation_id").notNull(),roundId:uuid("round_id").notNull(),gameId:uuid("game_id").notNull(),campaignId:uuid("campaign_id").notNull(),
 actorId:uuid("actor_id").references(()=>profiles.id,{onDelete:"restrict"}),operation:text("operation").notNull(),revision:integer("revision").notNull(),requestHash:text("request_hash").notNull(),details:jsonb("details").notNull(),transactionId:text("transaction_id").default(sql`pg_current_xact_id()::text`).notNull(),createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
 uniqueIndex("round_changes_operation_unique").on(t.operationId),uniqueIndex("round_changes_revision_unique").on(t.roundId,t.revision),
 foreignKey({name:"round_changes_round_fk",columns:[t.roundId,t.gameId,t.campaignId],foreignColumns:[rounds.id,rounds.gameId,rounds.campaignId]}).onDelete("restrict"),
 // set_duration is retained only for immutable legacy audit; the insert trigger rejects new entries.
 check("round_changes_operation_valid",sql`${t.operation} in ('create','set_duration','start','pause','resume','finish')`),
]).enableRLS();
