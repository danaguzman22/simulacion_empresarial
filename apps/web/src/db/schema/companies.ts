import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    name: text("name")
      .notNull(),

    description: text("description"),

    createdBy: uuid("created_by")
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
  },
  (table) => [
    index("companies_created_by_idx")
      .on(table.createdBy),
  ]
);