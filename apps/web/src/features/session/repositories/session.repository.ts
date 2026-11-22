import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignMembers, campaigns, companies, institutionMembers, institutions, profiles } from "@/db/schema";
import { inActiveInstitution, institutionAccessSql } from "@/features/institutions/repositories/institution-access";
import { bestCampaignRole, isUuid, pickActiveInstitution, type CampaignRole, type Membership } from "../domain/session";

// #72: only ACTIVE memberships count; revoked ones are never offered nor accepted.
export async function readActiveMemberships(actor: string): Promise<Membership[]> {
  return db.select({ id: institutions.id, name: institutions.name, role: institutionMembers.role }).from(institutionMembers)
    .innerJoin(institutions, eq(institutions.id, institutionMembers.institutionId))
    .where(and(eq(institutionMembers.profileId, actor), eq(institutionMembers.status, "active")))
    .orderBy(asc(institutions.name), asc(institutions.id));
}

export async function readProfileName(actor: string) {
  const [profile] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.id, actor));
  return profile?.name ?? null;
}

// The session as the server sees it: memberships checked in the database, the cookie only picks one of them.
export async function readSessionInstitutions(actor: string, cookieValue: string | null | undefined) {
  const memberships = await readActiveMemberships(actor);
  return { memberships, active: pickActiveInstitution(memberships, cookieValue) };
}

// Validates a choice coming from the browser: returns the id only if the person is an active member there.
export async function resolveInstitutionChoice(actor: string, raw: unknown): Promise<string | null> {
  if (!isUuid(raw)) return null;
  const memberships = await readActiveMemberships(actor);
  return memberships.find(m => m.id.toLowerCase() === raw.toLowerCase())?.id ?? null;
}

// Best campaign role of the person in the active institution (companies without institution count too, as everywhere).
export async function readBestCampaignRole(actor: string, institutionId: string | null): Promise<CampaignRole | null> {
  const rows = await db.select({ role: campaignMembers.role }).from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(campaignMembers.profileId, actor), institutionAccessSql(companies.id, actor), inActiveInstitution(companies.institutionId, institutionId)));
  return bestCampaignRole(rows.map(r => r.role));
}
