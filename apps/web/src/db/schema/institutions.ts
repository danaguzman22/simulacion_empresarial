import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, timestamp, integer, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
export const institutionType = pgEnum("institution_type", ["educational", "company", "other"]);
export const institutionRole = pgEnum("institution_role", ["admin", "teacher", "member"]);
export const institutionMemberStatus = pgEnum("institution_member_status", ["active", "revoked"]);
export const institutionRequestStatus = pgEnum("institution_request_status", ["pending", "approved", "rejected"]);
export const institutions = pgTable("institutions", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), type: institutionType("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("institutions_name_valid", sql`length(trim(${t.name})) between 2 and 160`)]).enableRLS();
export const institutionMembers = pgTable("institution_members", {
  id: uuid("id").defaultRandom().primaryKey(), institutionId: uuid("institution_id").notNull().references(() => institutions.id),
  profileId: uuid("profile_id").notNull().references(() => profiles.id), role: institutionRole("role").notNull().default("member"),
  status: institutionMemberStatus("status").notNull().default("active"), revision: integer("revision").notNull().default(0),
  grantedBy: uuid("granted_by").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("institution_members_identity_unique").on(t.institutionId, t.profileId), index("institution_members_profile_idx").on(t.profileId), check("institution_members_revision_valid", sql`${t.revision} >= 0`)]).enableRLS();
export const institutionAccessRequests = pgTable("institution_access_requests", {
  id: uuid("id").defaultRandom().primaryKey(), institutionId: uuid("institution_id").notNull().references(() => institutions.id),
  profileId: uuid("profile_id").notNull().references(() => profiles.id), message: text("message").notNull().default(""),
  status: institutionRequestStatus("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }), resolvedBy: uuid("resolved_by").references(() => profiles.id),
}, t => [uniqueIndex("institution_requests_pending_unique").on(t.institutionId, t.profileId).where(sql`${t.status} = 'pending'`),
  index("institution_requests_profile_idx").on(t.profileId), index("institution_requests_institution_idx").on(t.institutionId, t.status),
  check("institution_requests_message_valid", sql`length(${t.message}) <= 1000`),
  check("institution_requests_resolution_valid", sql`(${t.status} = 'pending' and ${t.resolvedAt} is null and ${t.resolvedBy} is null) or (${t.status} <> 'pending' and ${t.resolvedAt} is not null and ${t.resolvedBy} is not null)`),
]).enableRLS();
