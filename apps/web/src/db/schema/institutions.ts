import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, timestamp, integer, uniqueIndex, index, check, type PgColumn } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
// #6 (0034) adds "public_agency" and "ngo" (added at the end of the type, so existing values keep their order).
export const institutionType = pgEnum("institution_type", ["educational", "company", "other", "public_agency", "ngo"]);

// #6 (D-41): profile data of an institution, the same in a registration and in the approved institution. All columns
// accept null: institutions created before 0034 have none of them; for new registrations the database trigger
// requires the mandatory ones. Formats are checked here; CUIT and the province list, in the triggers.
export const institutionProfileColumns = () => ({
  displayName: text("display_name"), educationLevel: text("education_level"), sector: text("sector"), companySize: text("company_size"),
  organizationKind: text("organization_kind"), taxId: text("tax_id"), website: text("website"),
  country: text("country"), province: text("province"), postalCode: text("postal_code"), address: text("address"),
});
type ProfileColumns = { displayName: PgColumn; educationLevel: PgColumn; sector: PgColumn; companySize: PgColumn; organizationKind: PgColumn; taxId: PgColumn;
  website: PgColumn; country: PgColumn; province: PgColumn; postalCode: PgColumn; address: PgColumn };
// Optional text: null, or trimmed length within limits and no "<" / ">" (no HTML).
export const institutionProfileChecks = (prefix: string, t: ProfileColumns) => [
  check(`${prefix}_display_name_valid`, sql`${t.displayName} is null or (length(trim(${t.displayName})) between 2 and 80 and ${t.displayName} !~ '[<>]')`),
  check(`${prefix}_education_level_valid`, sql`${t.educationLevel} is null or ${t.educationLevel} in ('university', 'tertiary', 'secondary', 'vocational', 'other')`),
  check(`${prefix}_sector_valid`, sql`${t.sector} is null or ${t.sector} in ('technology', 'industry', 'commerce', 'services', 'finance', 'health', 'agro', 'construction', 'energy', 'other')`),
  check(`${prefix}_company_size_valid`, sql`${t.companySize} is null or ${t.companySize} in ('1-10', '11-50', '51-200', '201-1000', '1000+')`),
  check(`${prefix}_organization_kind_valid`, sql`${t.organizationKind} is null or ${t.organizationKind} in ('direct', 'branches')`),
  check(`${prefix}_tax_id_valid`, sql`${t.taxId} is null or (length(trim(${t.taxId})) between 3 and 40 and ${t.taxId} !~ '[<>]')`),
  check(`${prefix}_website_valid`, sql`${t.website} is null or (length(${t.website}) <= 200 and ${t.website} ~ '^https://[^[:space:]<>"'']+[.][^[:space:]<>"'']+$')`),
  check(`${prefix}_country_valid`, sql`${t.country} is null or ${t.country} ~ '^[A-Z]{2}$'`),
  check(`${prefix}_province_valid`, sql`${t.province} is null or (length(trim(${t.province})) between 2 and 100 and ${t.province} !~ '[<>]')`),
  check(`${prefix}_postal_code_valid`, sql`${t.postalCode} is null or (length(trim(${t.postalCode})) between 3 and 12 and ${t.postalCode} !~ '[<>]')`),
  check(`${prefix}_address_valid`, sql`${t.address} is null or (length(trim(${t.address})) between 3 and 200 and ${t.address} !~ '[<>]')`),
];
export const institutionRole = pgEnum("institution_role", ["admin", "teacher", "member"]);
export const institutionMemberStatus = pgEnum("institution_member_status", ["active", "revoked"]);
export const institutionRequestStatus = pgEnum("institution_request_status", ["pending", "approved", "rejected"]);
export const institutions = pgTable("institutions", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), type: institutionType("type").notNull(),
  // #6: "name" is the name shown in NEXUS (visible name, or the legal one); legal_name and the profile come from the
  // approved registration. Null only for institutions created before 0034.
  legalName: text("legal_name"), locality: text("locality"), ...institutionProfileColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("institutions_name_valid", sql`length(trim(${t.name})) between 2 and 160`),
  check("institutions_legal_name_valid", sql`${t.legalName} is null or (length(trim(${t.legalName})) between 2 and 160 and ${t.legalName} !~ '[<>]')`),
  check("institutions_locality_valid", sql`${t.locality} is null or (length(trim(${t.locality})) between 2 and 120 and ${t.locality} !~ '[<>]')`),
  ...institutionProfileChecks("institutions", t)]).enableRLS();
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
