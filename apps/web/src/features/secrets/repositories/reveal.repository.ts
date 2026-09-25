import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, games, gameRoleCards as cards, gameCardAssignments as assignments, cardSecretReveals as reveals, gameStateSets } from "@/db/schema";
import { access, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { requireCampaignInstitution } from "@/features/institutions/repositories/institution-access";
import { cardsEditable } from "@/features/cards/domain/card";
import { isUuid } from "@/features/students/domain/assignment";
import { RevealError, validateRevealConfiguration, type RevealResult } from "../domain/reveal";

function ids(...values: string[]) { if (values.some(v => !isUuid(v))) throw new RevealError("Ficha no disponible."); }
export async function configureReveals(actor: string, input: { gameId: string; cardId: string; revision: number; limit: number; seconds: number }) {
  ids(input.gameId, input.cardId); validateRevealConfiguration(input.limit, input.seconds, input.revision);
  return db.transaction(async tx => {
    const { game, role } = await access(tx, input.gameId, actor, true);
    const states = await tx.select({ phase: gameStateSets.phase, frozenAt: gameStateSets.frozenAt }).from(gameStateSets).where(eq(gameStateSets.gameId, game.id));
    if (role !== "master" || !cardsEditable(game.status, states)) throw new RevealError("Solo el Master puede configurar revelaciones durante la preparación.");
    const updated = await tx.update(cards).set({ secretRevealLimit: input.limit, secretRevealSeconds: input.seconds, revision: input.revision + 1, updatedBy: actor, updatedAt: new Date() })
      .where(and(eq(cards.id, input.cardId), eq(cards.gameId, game.id), eq(cards.campaignId, game.campaignId), eq(cards.revision, input.revision))).returning({ id: cards.id });
    if (!updated.length) throw new RevealError("La ficha cambió. Recargá los datos.");
  });
}
async function participant(tx: Transaction, gameId: string, actor: string) {
  const [located] = await tx.select({ campaignId: assignments.campaignId }).from(assignments).where(and(eq(assignments.gameId, gameId), eq(assignments.profileId, actor)));
  if (!located) throw new RevealError("No tenés acceso a esta ficha.");
  await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, located.campaignId)).for("update");
  const [game] = await tx.select().from(games).where(and(eq(games.id, gameId), eq(games.campaignId, located.campaignId))).for("update");
  if (!game) throw new RevealError("No tenés acceso a esta ficha.");
  await requireCampaignInstitution(tx, game.campaignId, actor, true);
  const [assignment] = await tx.select().from(assignments).where(and(eq(assignments.gameId, game.id), eq(assignments.campaignId, game.campaignId), eq(assignments.profileId, actor))).for("share");
  if (!assignment) throw new RevealError("No tenés acceso a esta ficha.");
  const [card] = await tx.select({ id: cards.id, limit: cards.secretRevealLimit, seconds: cards.secretRevealSeconds, hasSecret: sql<boolean>`length(trim(${cards.secretObjective})) > 0` }).from(cards)
    .where(and(eq(cards.id, assignment.cardId), eq(cards.gameId, game.id), eq(cards.campaignId, game.campaignId))).for("update");
  if (!card) throw new RevealError("No tenés acceso a esta ficha.");
  const result = await tx.execute<{ allowed: boolean }>(sql`select public.secret_reveal_execution_open(${game.id}::uuid) as allowed`);
  return { game, card, allowed: result[0].allowed };
}
async function authorizedText(tx: Transaction, actor: string, gameId: string, cardId: string, operationId: string): Promise<RevealResult> {
  // This is the only participant query that selects the secret text. Recheck
  // expiration at the final SQL read, after all potentially blocking locks.
  const rows = await tx.execute<{ text: string; expires_at: Date; remaining_ms: string }>(sql`
    select c.secret_objective as text, r.expires_at,
      floor(extract(epoch from (r.expires_at-clock_timestamp()))*1000)::text as remaining_ms
    from public.card_secret_reveals r join public.game_role_cards c on c.id=r.card_id and c.game_id=r.game_id and c.campaign_id=r.campaign_id
    where r.operation_id=${operationId}::uuid and r.actor_id=${actor}::uuid and r.game_id=${gameId}::uuid and r.card_id=${cardId}::uuid
      and r.discarded_at is null and r.expires_at>clock_timestamp() and public.secret_reveal_execution_open(r.game_id)`);
  if (!rows[0] || Number(rows[0].remaining_ms) <= 0) return { status: "expired" };
  return { status: "revealed", text: rows[0].text, operationId, expiresAt: new Date(rows[0].expires_at).toISOString(), remainingMs: Number(rows[0].remaining_ms) };
}
export async function revealSecret(actor: string, gameId: string, operationId?: string): Promise<RevealResult> {
  ids(gameId, ...(operationId ? [operationId] : []));
  return db.transaction(async tx => {
    const { game, card, allowed } = await participant(tx, gameId, actor);
    if (!allowed) return { status: "closed" };
    if (operationId) {
      const [existing] = await tx.select().from(reveals).where(eq(reveals.operationId, operationId));
      if (existing) {
        if (existing.actorId !== actor || existing.cardId !== card.id || existing.gameId !== game.id) throw new RevealError("La operación pertenece a otra solicitud.");
        return authorizedText(tx, actor, game.id, card.id, operationId);
      }
    }
    const [active] = await tx.select({ operationId: reveals.operationId }).from(reveals).where(and(eq(reveals.cardId, card.id), eq(reveals.actorId, actor), isNull(reveals.discardedAt), sql`${reveals.expiresAt}>clock_timestamp()`));
    if (!operationId) return active ? authorizedText(tx, actor, game.id, card.id, active.operationId) : { status: "expired" };
    // A different key is not silently bound to an earlier consumption.
    if (active) return { status: "already-open" };
    if (card.limit === null || card.seconds === null || !card.hasSecret) return { status: "unconfigured" };
    const [count] = await tx.select({ used: sql<number>`count(*)::integer` }).from(reveals).where(and(eq(reveals.cardId, card.id), isNull(reveals.discardedAt)));
    if (count.used >= card.limit) return { status: "exhausted" };
    await tx.insert(reveals).values({ gameId: game.id, campaignId: game.campaignId, cardId: card.id, actorId: actor, operationId, expiresAt: sql`clock_timestamp()` });
    return authorizedText(tx, actor, game.id, card.id, operationId);
  });
}
