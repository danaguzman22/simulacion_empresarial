import { copySuccessorCards } from "@/features/cards/repositories/card.repository";
import { copyGameRules } from "@/features/rules/repositories/rule.repository";
import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { games, gameKpis, gameStateSets, gameStateValues, gamePeriodChanges, gamePreparationChanges, gameLifecycleChanges } from "@/db/schema";
import { hash, selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { validateStartValues } from "../domain/start-game";
// Caller holds the campaign lock and authorizes the actor before entering here.
export async function createSuccessorGame(tx: Transaction, actorId: string, previous: typeof games.$inferSelect, input: { name: string; description: string | null; type: typeof games.$inferSelect.type; operationId: string }) {
 if (previous.status !== "completed") throw new PreparationError("Finalizá la partida anterior antes de crear una nueva.");
 const [source] = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, previous.id)).then(rows => rows.filter(s => s.phase === "final"));
 if (!source?.frozenAt) throw new PreparationError("La partida anterior no tiene un final congelado válido.");
 const selected = await tx.select().from(gameKpis).where(eq(gameKpis.gameId, previous.id));
 const values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, source.id));
 validateStartValues((await selectionContext(tx, previous.campaignId, previous.id)).definitions, values);
 const [created] = await tx.insert(games).values({ campaignId: previous.campaignId, sequence: previous.sequence + 1, name: input.name, description: input.description, type: input.type }).returning();
 if (previous.periodCount && previous.periodDurationSeconds && previous.periodLabel) {
  await tx.update(games).set({ periodCount: previous.periodCount, periodDurationSeconds: previous.periodDurationSeconds, periodLabel: previous.periodLabel, periodRevision: 1 }).where(eq(games.id, created.id));
  await tx.insert(gamePeriodChanges).values({ gameId: created.id, operationId: randomUUID(), actorId, revision: 1, requestHash: hash({ operationId: input.operationId, source: previous.id }), details: { sourceGameId: previous.id } });
 }
 const [prep] = await tx.insert(gameStateSets).values({ gameId: created.id, campaignId: previous.campaignId, phase: "preparation", sourceStateSetId: source.id, createdBy: actorId, updatedBy: actorId }).returning();
 if (selected.length) await tx.insert(gameKpis).values(selected.map(k => ({ gameId: created.id, campaignId: previous.campaignId, kpiDefinitionId: k.kpiDefinitionId, required: k.required, origin: "inherited" as const, createdBy: actorId })));
 if (values.length) await tx.insert(gameStateValues).values(values.map(v => ({ gameId: created.id, campaignId: previous.campaignId, stateSetId: prep.id, kpiDefinitionId: v.kpiDefinitionId, value: v.value, ordinalKey: v.ordinalKey })));
 await tx.update(gameStateSets).set({ revision: 1 }).where(eq(gameStateSets.id, prep.id));
 await tx.insert(gamePreparationChanges).values({ operationId: input.operationId, campaignId: previous.campaignId, stateSetId: prep.id, actorId, operation: "save_values", requestHash: hash({ actorId, ...input }), previousRevision: 0, revision: 1, details: { sourceStateSetId: source.id, sourceGameId: previous.id } });
 await tx.insert(gameLifecycleChanges).values({ operationId: input.operationId, gameId: created.id, campaignId: previous.campaignId, actorId, operation: "create_from_previous", details: { subjectGameId: created.id, previousGameId: previous.id, sourceStateSetId: source.id } });
 await copyGameRules(tx,previous.id,created.id,previous.campaignId,actorId);
 await copySuccessorCards(tx, previous.id, created.id, previous.campaignId, actorId);
 return { id: created.id };
}
