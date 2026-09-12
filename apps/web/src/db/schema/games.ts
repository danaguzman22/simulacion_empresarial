import { sql } from "drizzle-orm";

import {
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
