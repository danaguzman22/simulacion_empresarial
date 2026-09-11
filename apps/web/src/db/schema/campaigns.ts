import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  campaignStatusEnum,
} from "./common";

import {
  companies,
} from "./companies";

import {
  profiles,
} from "./profiles";

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    companyId: uuid("company_id")
      .notNull()
      .references(
        () => companies.id,
        {
          onDelete: "restrict",
        }
      ),

    name: text("name")
      .notNull(),

    description: text("description"),

    status: campaignStatusEnum(
      "status"
    )
      .default("draft")
      .notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(
        () => profiles.id,
        {
          onDelete: "restrict",
        }
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
    index("campaigns_company_id_idx")
      .on(table.companyId),

    index("campaigns_created_by_idx")
      .on(table.createdBy),
  ]
);