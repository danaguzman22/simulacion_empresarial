import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  campaignMemberRoleEnum,
} from "./common";

import {
  campaigns,
} from "./campaigns";

import {
  profiles,
} from "./profiles";

export const campaignMembers =
  pgTable(
    "campaign_members",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      campaignId: uuid(
        "campaign_id"
      )
        .notNull()
        .references(
          () => campaigns.id,
          {
            onDelete: "cascade",
          }
        ),

      profileId: uuid(
        "profile_id"
      )
        .notNull()
        .references(
          () => profiles.id,
          {
            onDelete: "cascade",
          }
        ),

      role: campaignMemberRoleEnum(
        "role"
      )
        .notNull(),

      joinedAt: timestamp(
        "joined_at",
        {
          withTimezone: true,
        }
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      uniqueIndex(
        "campaign_members_campaign_profile_unique"
      ).on(
        table.campaignId,
        table.profileId
      ),

      index(
        "campaign_members_campaign_id_idx"
      ).on(
        table.campaignId
      ),

      index(
        "campaign_members_profile_id_idx"
      ).on(
        table.profileId
      ),
    ]
  );