import { gameRoleCards } from "@/db/schema";
import { gameRules,gameRuleEffects,gameRuleExecutions } from "@/db/schema";
import "server-only";
import { persistGoalResult, resetGoals, deleteGoals } from "@/features/goals/repositories/goal.repository";
import { GoalError } from "@/features/goals/domain/goal";

import { createSuccessorGame } from "./create-successor.repository";
import { gameSituations } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignMembers, campaigns, gameKpiChanges, gameKpis, gameLifecycleChanges, gamePeriodChanges, gamePreparationChanges, gameStateSets, gameStateValues, games, roundChanges, rounds } from "@/db/schema";
import { access, hash, type Transaction } from "@/features/preparation/repositories/preparation.repository";

export class GameLifecycleError extends Error {}

async function lifecycleAudit(tx: Transaction, actorId: string, input: { operationId: string; gameId: string; campaignId: string; operation: "finish" | "reset" | "delete" | "create_from_previous"; details: unknown }) {
  await tx.insert(gameLifecycleChanges).values({ ...input, actorId, details: { ...(input.details as Record<string, unknown>), subjectGameId: input.gameId } });
}

async function replayLifecycle(tx: Transaction, actorId: string, input: { gameId: string; operationId: string }, operation: string) {
 const [audit] = await tx.select().from(gameLifecycleChanges).where(eq(gameLifecycleChanges.operationId, input.operationId));
 if (!audit) return null;
 const details = audit.details as Record<string, unknown>;
 const sourceId = operation === "create_from_previous" ? details.previousGameId : details.subjectGameId;
 if (audit.actorId !== actorId || audit.operation !== operation || sourceId !== input.gameId) throw new GameLifecycleError("La operación ya fue utilizada con otros datos.");
 await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, audit.campaignId)).for("update");
 const [member] = await tx.select().from(campaignMembers).where(and(eq(campaignMembers.campaignId, audit.campaignId), eq(campaignMembers.profileId, actorId))).for("share");
 if (!member || (operation === "finish" ? !["master", "co_master"].includes(member.role) : member.role !== "master")) throw new GameLifecycleError("No tenés permiso para esta operación.");
 return audit;
}
async function lifecycleContext(tx: Transaction, gameId: string, operation: "reset" | "delete") {
 await tx.execute(sql`select set_config('nexus.lifecycle_operation', ${operation}, true), set_config('nexus.lifecycle_game_id', ${gameId}, true)`);
}
async function ensureLastGame(tx: Transaction, gameId: string, campaignId: string) {
  const [last] = await tx.select({ id: games.id, sequence: games.sequence }).from(games).where(eq(games.campaignId, campaignId)).orderBy(asc(games.sequence)).for("update").then((rows) => rows.slice(-1));
  if (!last || last.id !== gameId) throw new GameLifecycleError("Solo se puede actuar sobre la última partida de la campaña.");
}

export async function finishGame(actorId: string, input: { gameId: string; operationId: string }) {
  return db.transaction(async (tx) => {
    const replay = await replayLifecycle(tx, actorId, input, "finish");
    if (replay) return { replayed: true, gameId: replay.gameId! };
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const lockedReplay = await replayLifecycle(tx, actorId, input, "finish");
    if (lockedReplay) return { replayed: true, gameId: lockedReplay.gameId! };
    if (role !== "master" && role !== "co_master") throw new GameLifecycleError("Solo Master o Co-Master pueden finalizar la partida.");
    if (game.status !== "evaluation") throw new GameLifecycleError("La partida debe estar pendiente de evaluación.");
    const periodRows = await tx.select({ status: rounds.status }).from(rounds).where(eq(rounds.gameId, game.id));
    if (!periodRows.length || periodRows.some((row) => row.status !== "completed")) throw new GameLifecycleError("Todos los períodos deben estar finalizados.");
    const [current] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, game.id), eq(gameStateSets.phase, "current"))).for("update");
    if (!current || current.frozenAt) throw new GameLifecycleError("El estado actual no está disponible para finalizar.");
    const [existingFinal] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, game.id), eq(gameStateSets.phase, "final"))).for("update");
    if (existingFinal) throw new GameLifecycleError("La partida ya tiene un snapshot final.");
    const values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, current.id));
    try { await persistGoalResult(tx, game.id, actorId); } catch (error) { if (error instanceof GoalError) throw new GameLifecycleError(error.message); throw error; }
    const now = new Date();
    const [final] = await tx.insert(gameStateSets).values({ gameId: game.id, campaignId: game.campaignId, phase: "final", createdBy: actorId, updatedBy: actorId }).returning({ id: gameStateSets.id });
    if (values.length) await tx.insert(gameStateValues).values(values.map((value) => ({ gameId: game.id, campaignId: game.campaignId, stateSetId: final.id, kpiDefinitionId: value.kpiDefinitionId, value: value.value, ordinalKey: value.ordinalKey })));
    await tx.update(gameStateSets).set({ frozenAt: now, updatedAt: now }).where(eq(gameStateSets.id, final.id));
    await tx.update(gameStateSets).set({ frozenAt: now, updatedAt: now }).where(eq(gameStateSets.id, current.id));
    await lifecycleAudit(tx, actorId, { operationId: input.operationId, gameId: game.id, campaignId: game.campaignId, operation: "finish", details: { currentStateSetId: current.id, finalStateSetId: final.id } });
    await tx.update(games).set({ status: "completed", completedAt: now, updatedAt: now }).where(and(eq(games.id, game.id), eq(games.status, "evaluation")));
    return { replayed: false, finalStateSetId: final.id };
  });
}

export async function resetGame(actorId: string, input: { gameId: string; operationId: string }) {
  return db.transaction(async (tx) => {
    const replay = await replayLifecycle(tx, actorId, input, "reset");
    if (replay) return { replayed: true, inherited: (replay.details as { mode?: string }).mode === "inherited" };
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const lockedReplay = await replayLifecycle(tx, actorId, input, "reset");
    if (lockedReplay) return { replayed: true, inherited: (lockedReplay.details as { mode?: string }).mode === "inherited" };
    if (role !== "master") throw new GameLifecycleError("Solo el Master puede reiniciar una partida.");
    await ensureLastGame(tx, game.id, game.campaignId);
    if (game.status === "completed") throw new GameLifecycleError("Una partida completada es histórica; usá Reiniciar para crear una nueva partida.");
    if (!["draft", "ready", "active", "paused", "evaluation"].includes(game.status)) throw new GameLifecycleError("Esta partida no admite reinicio.");
    const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, game.id)).for("update");
    const preparation = states.find(s => s.phase === "preparation");
    const initial = states.find(s => s.phase === "initial");
    if (!preparation || !initial) throw new GameLifecycleError("No hay una ejecución inicial para reiniciar.");
    const sourceId = preparation.sourceStateSetId ?? initial.sourceStateSetId;
    if (preparation.sourceStateSetId !== initial.sourceStateSetId) throw new GameLifecycleError("Los snapshots tienen orígenes inconsistentes; revisá la continuidad.");
    const initialValues = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, initial.id));
    const preparedValues = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, preparation.id));
    if (!initial.frozenAt || !preparation.frozenAt || initialValues.length !== preparedValues.length || initialValues.some(v => !preparedValues.some(w => w.kpiDefinitionId === v.kpiDefinitionId && w.value === v.value && w.ordinalKey === v.ordinalKey))) throw new GameLifecycleError("La preparaci\u00f3n y el estado inicial no coinciden; revis\u00e1 los datos antes de reiniciar.");
    const configuration = await tx.select().from(gameKpis).where(eq(gameKpis.gameId, game.id));
    const discarded = states.filter(s => s.phase !== "preparation");
    const discardedIds = discarded.map(s => s.id);
    const discardedValues = discardedIds.length ? await tx.select().from(gameStateValues).where(inArray(gameStateValues.stateSetId, discardedIds)) : [];
    await lifecycleAudit(tx, actorId, { operationId: input.operationId, gameId: game.id, campaignId: game.campaignId, operation: "reset", details: { sourceStateSetId: sourceId, mode: sourceId ? "inherited" : "editable", discardedStates: discarded, discardedValues, configuration } });
    await lifecycleContext(tx, game.id, "reset");
    await resetGoals(tx, game.id, actorId);
    await tx.delete(gameKpiChanges).where(eq(gameKpiChanges.gameId, game.id));
    await tx.delete(gameRuleExecutions).where(eq(gameRuleExecutions.gameId,game.id));
    await tx.delete(gameSituations).where(eq(gameSituations.gameId, game.id));
    await tx.delete(roundChanges).where(eq(roundChanges.gameId, game.id));
    await tx.delete(rounds).where(eq(rounds.gameId, game.id));
    if (discardedIds.length) {
      await tx.delete(gameStateValues).where(inArray(gameStateValues.stateSetId, discardedIds));
      await tx.delete(gameStateSets).where(inArray(gameStateSets.id, discardedIds));
    }
    await tx.update(games).set({ status: "ready", completedAt: null, startedAt: null, updatedAt: new Date() }).where(eq(games.id, game.id));
    const revision = preparation.revision + 1;
    await tx.update(gameStateSets).set({ frozenAt: null, revision, updatedBy: actorId, updatedAt: new Date() }).where(eq(gameStateSets.id, preparation.id));
    await tx.insert(gamePreparationChanges).values({ operationId: input.operationId, campaignId: game.campaignId, stateSetId: preparation.id, actorId, operation: "save_values", requestHash: hash({ actorId, ...input, operation: "reset_preparation" }), previousRevision: preparation.revision, revision, details: { lifecycleOperation: "reset", valuesUnchanged: true, configuration } });
    return { replayed: false, inherited: !!sourceId };

  });
}

export async function deleteGame(actorId: string, input: { gameId: string; operationId: string }) {
  return db.transaction(async (tx) => {
    const replay = await replayLifecycle(tx, actorId, input, "delete");
    if (replay) return { replayed: true, campaignId: replay.campaignId };
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const lockedReplay = await replayLifecycle(tx, actorId, input, "delete");
    if (lockedReplay) return { replayed: true, campaignId: lockedReplay.campaignId };
    if (role !== "master") throw new GameLifecycleError("Solo el Master puede eliminar una partida.");
    await ensureLastGame(tx, game.id, game.campaignId);
    if (game.status === "completed") throw new GameLifecycleError("Una partida completada no se puede eliminar.");
    await lifecycleContext(tx, game.id, "delete");
    await lifecycleAudit(tx, actorId, { operationId: input.operationId, gameId: game.id, campaignId: game.campaignId, operation: "delete", details: { deletedGameId: game.id, sequence: game.sequence } });
    await deleteGoals(tx, game.id);
    await tx.delete(gameKpiChanges).where(eq(gameKpiChanges.gameId, game.id));
    await tx.delete(gameRuleExecutions).where(eq(gameRuleExecutions.gameId,game.id));
    await tx.delete(gameSituations).where(eq(gameSituations.gameId, game.id));
    await tx.delete(roundChanges).where(eq(roundChanges.gameId, game.id));
    await tx.delete(gamePeriodChanges).where(eq(gamePeriodChanges.gameId, game.id));
    const stateIds = await tx.select({ id: gameStateSets.id }).from(gameStateSets).where(eq(gameStateSets.gameId, game.id));
    if (stateIds.length) await tx.delete(gamePreparationChanges).where(inArray(gamePreparationChanges.stateSetId, stateIds.map((state) => state.id)));
    await tx.delete(gameStateValues).where(eq(gameStateValues.gameId, game.id));
    await tx.delete(gameRuleEffects).where(eq(gameRuleEffects.gameId,game.id));
    await tx.delete(gameRules).where(eq(gameRules.gameId,game.id));
    await tx.delete(gameKpis).where(eq(gameKpis.gameId, game.id));
    await tx.delete(gameStateSets).where(eq(gameStateSets.gameId, game.id));
    await tx.delete(rounds).where(eq(rounds.gameId, game.id));
    await tx.delete(gameRoleCards).where(eq(gameRoleCards.gameId, game.id));
    await tx.delete(games).where(eq(games.id, game.id));
    return { replayed: false, campaignId: game.campaignId };
  });
}

export async function restartCompletedGame(actorId: string, input: { gameId: string; operationId: string }) {
  return db.transaction(async (tx) => {
    const replay = await replayLifecycle(tx, actorId, input, "create_from_previous");
    if (replay) return { replayed: true, gameId: replay.gameId! };
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const lockedReplay = await replayLifecycle(tx, actorId, input, "create_from_previous");
    if (lockedReplay) return { replayed: true, gameId: lockedReplay.gameId! };
    if (role !== "master") throw new GameLifecycleError("Solo el Master puede reiniciar una partida histórica.");
    await ensureLastGame(tx, game.id, game.campaignId);
    if (game.status !== "completed") throw new GameLifecycleError("Esta acción sobre una partida completada crea una nueva partida.");
    const created = await createSuccessorGame(tx, actorId, game, { name: `${game.name} (reinicio)`, description: game.description, type: game.type, operationId: input.operationId });
    return { replayed: false, gameId: created.id };
  });
}
