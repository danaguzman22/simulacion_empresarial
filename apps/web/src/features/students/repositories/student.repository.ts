import { institutionAccessSql } from "@/features/institutions/repositories/institution-access";
import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameCardAssignments as assignments, gameRoleCards as cards, games, campaigns, companies, profiles, cardSecretReveals, rounds } from "@/db/schema";
import { canReadAssignedCard } from "../domain/assignment";

export async function listAssignedGames(actorId: string) {
  return db.select({ id: games.id, name: games.name, status: games.status, campaign: campaigns.name, company: companies.name,
    department: sql<string | null>`case when ${games.status} in ('active','paused','evaluation','completed') then ${cards.department} else null end`,
  }).from(assignments).innerJoin(games, eq(games.id, assignments.gameId))
    .innerJoin(cards, and(eq(cards.id, assignments.cardId), eq(cards.gameId, games.id), eq(cards.campaignId, games.campaignId)))
    .innerJoin(campaigns, eq(campaigns.id, games.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(assignments.profileId, actorId), institutionAccessSql(companies.id, actorId))).orderBy(desc(games.createdAt), asc(games.id));
}

export async function readAssignedCard(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const [assignment] = await tx.select({ cardId: assignments.cardId, gameId: games.id, campaignId: games.campaignId, name: games.name, status: games.status, periodLabel: games.periodLabel })
      .from(assignments).innerJoin(games, and(eq(games.id, assignments.gameId), eq(games.campaignId, assignments.campaignId)))
      .innerJoin(campaigns, eq(campaigns.id, games.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
      .where(and(eq(assignments.profileId, actorId), eq(assignments.gameId, gameId), institutionAccessSql(companies.id, actorId)));
    if (!assignment || !canReadAssignedCard(assignment.status)) return null;
    // Explicit projection: secret_objective is never selected, serialized or sent.
    const [card] = await tx.select({ id: cards.id, name: cards.name, department: cards.department, description: cards.description,
      visualIdentity: cards.visualIdentity, responsibilities: cards.responsibilities, selectedResponsibilities: cards.selectedResponsibilities,
      publicInformation: cards.publicInformation, privateInformation: cards.privateInformation, individualObjective: cards.individualObjective,
      configuredModifiers: cards.configuredModifiers, ana: cards.ana, vis: cards.vis, neg: cards.neg, ope: cards.ope, ada: cards.ada,
      secretRevealLimit: cards.secretRevealLimit, secretRevealSeconds: cards.secretRevealSeconds,
      hasSecret: sql<boolean>`coalesce(length(btrim(${cards.secretObjective})) > 0, false)`,
      abilities: cards.abilities, weaknesses: cards.weaknesses, restrictions: cards.restrictions, revision: cards.revision,
    }).from(cards).where(and(eq(cards.id, assignment.cardId), eq(cards.gameId, gameId), eq(cards.campaignId, assignment.campaignId)));
    if (!card) return null;
    const teammates = await tx.select({ name: profiles.displayName }).from(assignments).innerJoin(profiles, eq(profiles.id, assignments.profileId))
      .where(and(eq(assignments.cardId, card.id), eq(assignments.gameId, gameId), eq(assignments.campaignId, assignment.campaignId), sql`public.company_institution_access((select company_id from public.campaigns where id=${assignment.campaignId}::uuid), ${assignments.profileId})`))
      .orderBy(asc(profiles.displayName), asc(assignments.id));
    const [count] = await tx.select({ used: sql<number>`count(*)::integer` }).from(cardSecretReveals).where(and(eq(cardSecretReveals.cardId, card.id), isNull(cardSecretReveals.discardedAt)));
    const availability = await tx.execute<{ allowed: boolean }>(sql`select public.secret_reveal_execution_open(${gameId}::uuid) as allowed`);
    const reveal = { limit: card.secretRevealLimit ?? 0, durationSeconds: card.secretRevealSeconds ?? 0, used: count.used, configured: card.secretRevealLimit !== null && card.secretRevealSeconds !== null && card.hasSecret, enabled: availability[0].allowed };
    // Clock: the server sends the end time (or the paused remainder) and its own time; the browser only counts down.
    const [round] = await tx.select({ sequence: rounds.sequence, name: rounds.name, status: rounds.status, endsAt: rounds.endsAt, remainingMs: rounds.remainingMs })
      .from(rounds).where(and(eq(rounds.gameId, gameId), eq(rounds.campaignId, assignment.campaignId), inArray(rounds.status, ["active", "paused"])));
    const time = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const clock = { serverNow: new Date(time[0].now).toISOString(), period: round ? { label: `${assignment.periodLabel ?? "Ronda"} ${round.sequence}`, name: round.name, status: round.status, endsAt: round.endsAt?.toISOString() ?? null, remainingMs: round.remainingMs } : null };
    return { reveal, clock, game: { id: gameId, name: assignment.name, status: assignment.status }, card, teammates };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
