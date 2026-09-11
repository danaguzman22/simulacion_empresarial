import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  roomStatusEnum,
} from "./common";

import {
  campaigns,
} from "./campaigns";

import {
  games,
} from "./games";

import {
  rounds,
} from "./rounds";

import {
  profiles,
} from "./profiles";

export const rooms = pgTable(
  "rooms",
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

    code: varchar(
      "code",
      {
        length: 8,
      }
    )
      .notNull(),

    status: roomStatusEnum(
      "status"
    )
      .default("open")
      .notNull(),

    activeGameId: uuid(
      "active_game_id"
    )
      .references(
        () => games.id,
        {
          onDelete: "set null",
        }
      ),

    activeRoundId: uuid(
      "active_round_id"
    )
      .references(
        () => rounds.id,
        {
          onDelete: "set null",
        }
      ),

    createdBy: uuid(
      "created_by"
    )
      .notNull()
      .references(
        () => profiles.id,
        {
          onDelete: "restrict",
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

    closedAt: timestamp(
      "closed_at",
      {
        withTimezone: true,
      }
    ),
  },

  (table) => [
    uniqueIndex(
      "rooms_code_unique"
    ).on(table.code),

    index(
      "rooms_campaign_id_idx"
    ).on(table.campaignId),

    index(
      "rooms_status_idx"
    ).on(table.status),
  ]
);