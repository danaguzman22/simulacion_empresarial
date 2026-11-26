import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaignMembers, campaigns, companies, gameCardAssignments, games, institutionMembers, institutions, profiles } from "@/db/schema";
import { inActiveInstitution, institutionAccessSql } from "@/features/institutions/repositories/institution-access";
import { bestCampaignRole, isUuid, pickActiveInstitution, type AreaAccess, type CampaignRole, type Membership } from "../domain/session";

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

// Best campaign role of the person in the active institution only.
export async function readBestCampaignRole(actor: string, institutionId: string | null): Promise<CampaignRole | null> {
  const rows = await db.select({ role: campaignMembers.role }).from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(campaignMembers.profileId, actor), institutionAccessSql(companies.id, actor), inActiveInstitution(companies.institutionId, institutionId)));
  return bestCampaignRole(rows.map(r => r.role));
}

// "Ir a" (user menu): which areas the person can use, with the same rules as each area. Only companies the person
// can access count (institutionAccessSql). The NEXUS flag is checked by isNexusAdmin in getSession.
// - Mis partidas: a card assigned in some game;
// - Panel: teacher in an active membership, or Master, Co-Master or Observer of some campaign.
export async function readAreaAccess(actor: string): Promise<Omit<AreaAccess, "nexus">> {
  const [assignment] = await db.select({ id: gameCardAssignments.id }).from(gameCardAssignments)
    .innerJoin(games, eq(games.id, gameCardAssignments.gameId)).innerJoin(campaigns, eq(campaigns.id, games.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(gameCardAssignments.profileId, actor), institutionAccessSql(companies.id, actor))).limit(1);
  const [teacher] = await db.select({ id: institutionMembers.id }).from(institutionMembers)
    .where(and(eq(institutionMembers.profileId, actor), eq(institutionMembers.status, "active"), eq(institutionMembers.role, "teacher"))).limit(1);
  const [staff] = teacher ? [teacher] : await db.select({ id: campaignMembers.campaignId }).from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(campaignMembers.profileId, actor), inArray(campaignMembers.role, ["master", "co_master", "observer"]), institutionAccessSql(companies.id, actor))).limit(1);
  return { participant: Boolean(assignment), panel: Boolean(staff) };
}
