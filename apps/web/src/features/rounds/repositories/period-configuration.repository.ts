import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { games, gameStateSets, gamePeriodChanges } from "@/db/schema";
import { access, hash } from "@/features/preparation/repositories/preparation.repository";
import { canWritePreparation } from "@/features/preparation/domain/preparation";
import { RoundError } from "../domain/round";
import { validatePeriodConfiguration, type PeriodConfiguration } from "../domain/period-configuration";
export async function readPeriodConfiguration(gameId: string, actorId: string) {
 return db.transaction(async tx => {
  const { game, role } = await access(tx, gameId, actorId, false);
  const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, gameId));
  return { count: game.periodCount, label: game.periodLabel, durationSeconds: game.periodDurationSeconds, revision: game.periodRevision,
   canEdit: canWritePreparation(role) && ["draft", "ready"].includes(game.status) && !states.some(s => s.phase !== "preparation" || s.frozenAt) };
 }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function savePeriodConfiguration(actorId: string, input: PeriodConfiguration & { gameId: string; operationId: string; expectedRevision: number }) {
 const config = validatePeriodConfiguration(input), requestHash = hash({ actorId, ...input });
 return db.transaction(async tx => {
  const { game } = await access(tx, input.gameId, actorId, true);
  const [replay] = await tx.select().from(gamePeriodChanges).where(eq(gamePeriodChanges.operationId, input.operationId));
  if (replay) { if (replay.requestHash !== requestHash || replay.actorId !== actorId || replay.gameId !== game.id) throw new RoundError("Operación utilizada con otros datos."); return { replayed: true }; }
  const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, game.id));
  if (!["draft", "ready"].includes(game.status) || states.some(s => s.phase !== "preparation" || s.frozenAt)) throw new RoundError("La configuración ya está bloqueada.");
  if (game.periodRevision !== input.expectedRevision) throw new RoundError("La configuración cambió. Recargá los datos antes de guardar.");
  const revision = game.periodRevision + 1;
  await tx.update(games).set({ periodCount: config.count, periodLabel: config.label, periodDurationSeconds: config.durationSeconds, periodRevision: revision, updatedAt: new Date() }).where(eq(games.id, game.id));
  await tx.insert(gamePeriodChanges).values({ gameId: game.id, operationId: input.operationId, actorId, revision, requestHash, details: { before: { count: game.periodCount, label: game.periodLabel, durationSeconds: game.periodDurationSeconds }, after: { count: config.count, label: config.label, durationSeconds: config.durationSeconds } } });
  return { replayed: false };
 });
}
