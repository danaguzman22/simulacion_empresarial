import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { institutions, institutionType } from "./institutions";

// #6 (D-16, D-17, D-18): NEXUS administration. Writes go only through the SECURITY DEFINER functions of 0034,
// and triggers re-check every rule (only an active NEXUS admin grants the role, never the last one is revoked,
// every action is recorded).

// An institution registered with the form waits here until a NEXUS admin approves or rejects it. It only becomes
// a row of "institutions" when approved, so pending or rejected ones never appear in any search or listing.
export const institutionRegistrationStatus = pgEnum("institution_registration_status", ["pending", "approved", "rejected"]);
export const institutionRegistrations = pgTable("institution_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id),
  name: text("name").notNull(), type: institutionType("type").notNull(), locality: text("locality").notNull(),
  message: text("message").notNull().default(""),
  status: institutionRegistrationStatus("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }), resolvedBy: uuid("resolved_by").references(() => profiles.id),
  rejectionReason: text("rejection_reason"),
  institutionId: uuid("institution_id").references(() => institutions.id),
}, t => [
  index("institution_registrations_profile_idx").on(t.profileId, t.status),
  index("institution_registrations_status_idx").on(t.status, t.requestedAt),
  check("institution_registrations_name_valid", sql`length(trim(${t.name})) between 2 and 160 and ${t.name} !~ '[<>]'`),
  check("institution_registrations_locality_valid", sql`length(trim(${t.locality})) between 2 and 120 and ${t.locality} !~ '[<>]'`),
  check("institution_registrations_message_valid", sql`length(${t.message}) <= 1000 and ${t.message} !~ '[<>]'`),
  check("institution_registrations_reason_valid", sql`${t.rejectionReason} is null or (length(trim(${t.rejectionReason})) between 3 and 1000 and ${t.rejectionReason} !~ '[<>]')`),
  check("institution_registrations_resolution_valid", sql`(${t.status} = 'pending' and ${t.resolvedAt} is null and ${t.resolvedBy} is null and ${t.rejectionReason} is null and ${t.institutionId} is null)
    or (${t.status} = 'approved' and ${t.resolvedAt} is not null and ${t.resolvedBy} is not null and ${t.rejectionReason} is null and ${t.institutionId} is not null)
    or (${t.status} = 'rejected' and ${t.resolvedAt} is not null and ${t.resolvedBy} is not null and ${t.rejectionReason} is not null and ${t.institutionId} is null)`),
]).enableRLS();

// NEXUS admins. A row is never deleted: revoking sets revoked_at/revoked_by; granting again adds a new row.
// granted_by is null only for the very first admin, created by an operator script when there is no other.
export const nexusAdmins = pgTable("nexus_admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id),
  grantedBy: uuid("granted_by").references(() => profiles.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }), revokedBy: uuid("revoked_by").references(() => profiles.id),
}, t => [
  uniqueIndex("nexus_admins_active_unique").on(t.profileId).where(sql`${t.revokedAt} is null`),
  check("nexus_admins_revocation_valid", sql`(${t.revokedAt} is null) = (${t.revokedBy} is null)`),
]).enableRLS();

// Append-only record of every NEXUS administration action, written by triggers (also for operator scripts).
export const nexusAdminActions = pgTable("nexus_admin_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: text("action").notNull(),
  targetProfileId: uuid("target_profile_id").references(() => profiles.id),
  registrationId: uuid("registration_id").references(() => institutionRegistrations.id),
  institutionId: uuid("institution_id").references(() => institutions.id),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("nexus_admin_actions_created_idx").on(t.createdAt),
  check("nexus_admin_actions_action_valid", sql`${t.action} in ('grant_admin', 'revoke_admin', 'approve_institution', 'reject_institution')`),
  check("nexus_admin_actions_actor_valid", sql`${t.actorId} is not null or ${t.action} = 'grant_admin'`),
]).enableRLS();
