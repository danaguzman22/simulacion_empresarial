import { pgEnum } from "drizzle-orm/pg-core";

export const campaignStatusEnum =
  pgEnum("campaign_status", [
    "draft",
    "active",
    "completed",
    "archived",
  ]);

export const campaignMemberRoleEnum =
  pgEnum("campaign_member_role", [
    "master",
    "co_master",
    "observer",
  ]);

  export const gameTypeEnum =
  pgEnum("game_type", [
    "onboarding",
    "development",
    "final",
    "custom",
  ]);

export const gameStatusEnum =
  pgEnum("game_status", [
    "draft",
    "ready",
    "active",
    "paused",
    "completed",
    "cancelled",
  ]);

export const roundStatusEnum =
  pgEnum("round_status", [
    "pending",
    "active",
    "paused",
    "completed",
    "cancelled",
  ]);

export const roomStatusEnum =
  pgEnum("room_status", [
    "open",
    "active",
    "closed",
  ]);