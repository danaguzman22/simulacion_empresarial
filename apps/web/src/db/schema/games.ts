import { sql } from "drizzle-orm";

import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  gameStatusEnum,
  gameTypeEnum,
} from "./common";

import {
  campaigns,
} from "./campaigns";

export const games = pgTable(
  "games",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    campaignId: uuid("campaign_id")
      .notNull()
      .references(
        () => campaigns.id,
        {
          onDelete: "cascade",
        }
      ),

    sequence: integer("sequence")
      .notNull(),

    name: text("name")
      .notNull(),

    description: text("description"),
    periodCount: integer("period_count"),
    periodLabel: text("period_label"),
    periodDurationSeconds: integer("period_duration_seconds"),
    periodRevision: integer("period_revision").notNull().default(0),

    type: gameTypeEnum("type")
      .default("development")
      .notNull(),

    status: gameStatusEnum("status")
      .default("draft")
      .notNull(),

    startedAt: timestamp(
      "started_at",
      {
        withTimezone: true,
      }
    ),

    completedAt: timestamp(
      "completed_at",
      {
        withTimezone: true,
      }
    ),

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      }
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
      {
        withTimezone: true,
      }
    )
      .defaultNow()
      .notNull(),
  },

  (table) => [
    check("games_period_configuration_valid", sql`(${table.periodCount} is null and ${table.periodLabel} is null and ${table.periodDurationSeconds} is null) or (${table.periodCount} is not null and ${table.periodCount}>0 and ${table.periodLabel} is not null and length(trim(${table.periodLabel})) between 1 and 80 and ${table.periodDurationSeconds} is not null and ${table.periodDurationSeconds}>0)`),
    check("games_period_revision_valid", sql`${table.periodRevision}>=0`),
    uniqueIndex("games_id_campaign_unique").on(table.id, table.campaignId),
    uniqueIndex("games_one_active_per_campaign_unique").on(table.campaignId)
      .where(sql`${table.status} in ('active', 'paused')`),
    uniqueIndex(
      "games_campaign_sequence_unique"
    ).on(
      table.campaignId,
      table.sequence
    ),

    index(
      "games_campaign_id_idx"
    ).on(table.campaignId),

    index(
      "games_status_idx"
    ).on(table.status),
  ]
);
