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
  roundStatusEnum,
} from "./common";

import {
  games,
} from "./games";

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    gameId: uuid("game_id")
      .notNull()
      .references(
        () => games.id,
        {
          onDelete: "cascade",
        }
      ),

    sequence: integer("sequence")
      .notNull(),

    name: text("name"),

    status: roundStatusEnum(
      "status"
    )
      .default("pending")
      .notNull(),

    durationSeconds: integer(
      "duration_seconds"
    ),

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
    uniqueIndex(
      "rounds_game_sequence_unique"
    ).on(
      table.gameId,
      table.sequence
    ),

    index(
      "rounds_game_id_idx"
    ).on(table.gameId),

    index(
      "rounds_status_idx"
    ).on(table.status),
  ]
);