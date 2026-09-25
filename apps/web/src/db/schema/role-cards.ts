import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { games } from "./games";
import { profiles } from "./profiles";

import type { Ability, Weakness, Restriction, CardModifier } from "@/features/cards/domain/card-structure";
const content = () => ({
  configuredModifiers: jsonb("configured_modifiers").$type<CardModifier[]>(),
  abilities: jsonb("abilities").$type<Ability[]>().notNull().default(sql`'[]'::jsonb`),
  weaknesses: jsonb("weaknesses").$type<Weakness[]>().notNull().default(sql`'[]'::jsonb`),
  restrictions: jsonb("restrictions").$type<Restriction[]>().notNull().default(sql`'[]'::jsonb`),
  selectedResponsibilities: text("selected_responsibilities").array().notNull().default(sql`ARRAY[]::text[]`),
  ana: integer("ana"), vis: integer("vis"), neg: integer("neg"), ope: integer("ope"), ada: integer("ada"),
  name: text("name").notNull(), department: text("department").notNull().default(""),
  description: text("description").notNull().default(""), responsibilities: text("responsibilities").notNull().default(""),
  publicInformation: text("public_information").notNull().default(""), visualIdentity: text("visual_identity").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  createdBy: uuid("created_by").notNull().references(() => profiles.id),
  updatedBy: uuid("updated_by").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const campaignRoleCards = pgTable("campaign_role_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  ...content(),
  privateInformation: text("private_information").notNull().default(""),
  individualObjective: text("individual_objective").notNull().default(""),
  secretObjective: text("secret_objective").notNull().default(""),
}, t => [uniqueIndex("campaign_role_cards_identity_unique").on(t.id, t.campaignId),
  check("campaign_role_cards_valid", sql`length(trim(${t.name})) between 1 and 160 and length(${t.department})<=160 and length(${t.visualIdentity})<=160 and length(${t.description})<=5000 and length(${t.responsibilities})<=5000 and length(${t.publicInformation})<=5000 and ${t.revision}>=0`),
]).enableRLS();
export const gameRoleCards = pgTable("game_role_cards", {
  secretRevealLimit: integer("secret_reveal_limit"),
  secretRevealSeconds: integer("secret_reveal_seconds"),
  id: uuid("id").defaultRandom().primaryKey(), gameId: uuid("game_id").notNull(), campaignId: uuid("campaign_id").notNull(),
  sourceCardId: uuid("source_card_id").notNull(), ...content(),
  privateInformation: text("private_information").notNull().default(""),
  individualObjective: text("individual_objective").notNull().default(""),
  secretObjective: text("secret_objective").notNull().default(""),
}, t => [uniqueIndex("game_role_cards_source_unique").on(t.gameId, t.sourceCardId),
  check("game_role_cards_reveal_config_valid", sql`(${t.secretRevealLimit} is null and ${t.secretRevealSeconds} is null) or (${t.secretRevealLimit} is not null and ${t.secretRevealSeconds} is not null and ${t.secretRevealLimit} between 0 and 100 and ${t.secretRevealSeconds} between 1 and 3600)`),
  uniqueIndex("game_role_cards_assignment_identity_unique").on(t.id, t.gameId, t.campaignId),
  foreignKey({ name: "game_role_cards_game_fk", columns: [t.gameId, t.campaignId], foreignColumns: [games.id, games.campaignId] }).onDelete("cascade"),
  foreignKey({ name: "game_role_cards_source_fk", columns: [t.sourceCardId, t.campaignId], foreignColumns: [campaignRoleCards.id, campaignRoleCards.campaignId] }).onDelete("restrict"),
  check("game_role_cards_valid", sql`length(trim(${t.name})) between 1 and 160 and length(${t.department})<=160 and length(${t.visualIdentity})<=160 and length(${t.description})<=5000 and length(${t.responsibilities})<=5000 and length(${t.publicInformation})<=5000 and length(${t.privateInformation})<=5000 and length(${t.individualObjective})<=5000 and length(${t.secretObjective})<=5000 and ${t.revision}>=0`),
]).enableRLS();

// Personal catalogue, reusable across the owner's companies/campaigns. Card copies
// store labels independently so catalogue management cannot rewrite history.
export const cardResponsibilities = pgTable("card_responsibilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => profiles.id),
  label: text("label").notNull(), normalizedLabel: text("normalized_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("card_responsibilities_owner_label_unique").on(t.ownerId, t.normalizedLabel),
  check("card_responsibilities_label_valid", sql`length(trim(${t.label})) between 1 and 5000 and length(${t.normalizedLabel}) between 1 and 5000`),
]).enableRLS();

export const cardModifierDefinitions = pgTable("card_modifier_definitions", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: uuid("owner_id").notNull().references(() => profiles.id),
  name: text("name").notNull(), abbreviation: text("abbreviation").notNull(), normalizedName: text("normalized_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("card_modifier_definitions_owner_name_unique").on(t.ownerId,t.normalizedName),
  uniqueIndex("card_modifier_definitions_owner_abbreviation_unique").on(t.ownerId,t.abbreviation),
  check("card_modifier_definitions_valid", sql`length(trim(${t.name})) between 1 and 160 and length(${t.normalizedName}) between 1 and 160 and ${t.abbreviation} ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'`),
]).enableRLS();
