import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameGoals, gameGoalChanges, gameResults, gameStateSets, gameStateValues, rounds } from "@/db/schema";
import { access, hash, selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { classifyResult, GoalError, suggest, validateGoal, type GoalDefinition } from "../domain/goal";

export type GoalInput = { gameId: string; operationId: string; operation: "create" | "update" | "delete" | "evaluate"; goalId?: string; expectedRevision?: number; definition?: GoalDefinition; fulfilled?: boolean; observation?: string | null };
async function context(tx: Transaction, gameId: string, actorId: string, write: boolean) {
  const found = await access(tx, gameId, actorId, write);
  const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, gameId));
  const active = await tx.select().from(rounds).where(and(eq(rounds.gameId, gameId), sql`(${rounds.status}='paused' OR (${rounds.status}='active' AND ${rounds.endsAt}>clock_timestamp()))`));
  const editable = ["draft", "ready"].includes(found.game.status) && !states.some(s => s.phase !== "preparation" || s.frozenAt);
  return { ...found, states, activeRound: active[0], editable };
}
export async function readGoals(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const c = await context(tx, gameId, actorId, false);
    const goals = await tx.select().from(gameGoals).where(eq(gameGoals.gameId, gameId)).orderBy(asc(gameGoals.createdAt), asc(gameGoals.id));
    const definitions = (await selectionContext(tx, c.game.campaignId, gameId)).definitions;
    const current = c.states.find(s => s.phase === "current");
    const values = current ? await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, current.id)) : [];
    const [result] = await tx.select().from(gameResults).where(eq(gameResults.gameId, gameId));
    const evaluated = goals.filter(g => g.fulfilled !== null).length, fulfilled = goals.filter(g => g.fulfilled).length;
    return {
      gameId, status: c.game.status, canCreate: c.role === "master" && (c.editable || (["active", "paused"].includes(c.game.status) && !!c.activeRound)), canEdit: c.role === "master" && c.editable, canEvaluate: c.role === "master" && c.game.status === "evaluation",
      definitions: definitions.map(k => ({ id: k.id, name: k.name, valueType: k.valueType, unit: k.unit, ordinalOptions: k.ordinalOptions })),
      goals: goals.map(goal => {
        const definition = definitions.find(k => k.id === goal.kpiDefinitionId), currentValue = values.find(v => v.kpiDefinitionId === goal.kpiDefinitionId);
        return { ...goal, suggestion: c.game.status === "completed" ? goal.suggestedFulfilled : suggest(goal, currentValue), kpiName: definition?.name,
          targetLabel: goal.ordinalTargetKey === null ? `${goal.operator ?? ""} ${goal.numericTarget ?? ""} ${definition?.unit ?? ""}`.trim() : `= ${definition?.ordinalOptions.find(o => o.key === goal.ordinalTargetKey)?.label ?? goal.ordinalTargetKey}`,
          currentLabel: !currentValue ? "Sin valor" : currentValue.ordinalKey !== null ? definition?.ordinalOptions.find(o => o.key === currentValue.ordinalKey)?.label ?? "Nivel no disponible" : `${currentValue.value} ${definition?.unit ?? ""}`,
        };
      }),
      result: result ?? (c.game.status === "evaluation" && evaluated === goals.length ? {fulfilledCount:fulfilled,evaluatedCount:evaluated,category:classifyResult(fulfilled,evaluated)} : null),
    };
  });
}
export async function mutateGoal(actorId: string, input: GoalInput) {
  const requestHash = hash({ actorId, ...input });
  return db.transaction(async tx => {
    const c = await context(tx, input.gameId, actorId, true);
    if (c.role !== "master") throw new GoalError("Solo el Master puede gestionar y evaluar metas.");
    const [replay] = await tx.select().from(gameGoalChanges).where(eq(gameGoalChanges.operationId, input.operationId));
    if (replay) {
      if (replay.actorId !== actorId || replay.gameId !== input.gameId || replay.requestHash !== requestHash) throw new GoalError("La operación ya fue utilizada con otros datos.");
      return {id:replay.goalId,replayed:true};
    }
    const [old] = input.goalId ? await tx.select().from(gameGoals).where(and(eq(gameGoals.id, input.goalId),eq(gameGoals.gameId,input.gameId))).for("update") : [];
    if (input.operation !== "create" && (!old || old.revision !== input.expectedRevision)) throw new GoalError("La meta cambió. Recargá los datos antes de continuar.");
    if (input.operation === "evaluate") {
      if (c.game.status !== "evaluation" || typeof input.fulfilled !== "boolean" || (input.observation?.length ?? 0) > 4000) throw new GoalError("Solo se pueden evaluar metas durante evaluación; la observación admite hasta 4000 caracteres.");
    } else if (input.operation === "create") {
      if (!c.editable && !(["active","paused"].includes(c.game.status) && c.activeRound)) throw new GoalError("Agregá metas durante preparación o una ronda activa/pausada vigente.");
    } else if (!c.editable || old?.createdRoundSequence !== null) throw new GoalError("La definición de esta meta ya no es editable.");
    await tx.execute(sql`select set_config('nexus.goal_actor',${actorId},true),set_config('nexus.goal_operation_id',${input.operationId},true),set_config('nexus.goal_request_hash',${requestHash},true)`);
    if (input.operation === "delete") { await tx.delete(gameGoals).where(eq(gameGoals.id,old!.id)); return {id:old!.id,replayed:false}; }
    if (input.operation === "evaluate") {
      await tx.update(gameGoals).set({fulfilled:input.fulfilled,observation:input.observation?.trim() || null,revision:old!.revision+1,updatedBy:actorId}).where(eq(gameGoals.id,old!.id));
      return {id:old!.id,replayed:false};
    }
    if (!input.definition) throw new GoalError("Falta la definición de la meta.");
    const definition = validateGoal(input.definition);
    if (definition.goalType === "kpi") {
      const selected = (await selectionContext(tx,c.game.campaignId,c.game.id)).definitions.find(k => k.id === definition.kpiDefinitionId);
      if (!selected || (selected.valueType === "numeric" ? definition.numericTarget === null : definition.ordinalTargetKey === null || !selected.ordinalOptions.some(o => o.key === definition.ordinalTargetKey))) throw new GoalError("La condición debe corresponder a un KPI seleccionado en esta partida y a su tipo de valor.");
    }
    if (input.operation === "update") {
      await tx.update(gameGoals).set({...definition,revision:old!.revision+1,updatedBy:actorId}).where(eq(gameGoals.id,old!.id));
      return {id:old!.id,replayed:false};
    }
    const [created] = await tx.insert(gameGoals).values({...definition,gameId:c.game.id,campaignId:c.game.campaignId,createdBy:actorId,updatedBy:actorId}).returning({id:gameGoals.id});
    return {id:created.id,replayed:false};
  });
}
export async function persistGoalResult(tx: Transaction, gameId: string, actorId: string) {
  const goals = await tx.select().from(gameGoals).where(eq(gameGoals.gameId,gameId));
  if (goals.some(g => g.fulfilled === null)) throw new GoalError("Evaluá todas las metas antes de finalizar la partida.");
  const fulfilledCount = goals.filter(g => g.fulfilled).length, evaluatedCount = goals.length;
  await tx.insert(gameResults).values({gameId,fulfilledCount,evaluatedCount,category:classifyResult(fulfilledCount,evaluatedCount),createdBy:actorId});
}
// Caller has already recorded the authorized, transaction-scoped lifecycle audit.
export async function resetGoals(tx: Transaction, gameId: string, actorId: string) {
  await tx.update(gameGoals).set({fulfilled:null,evaluatedBy:null,evaluatedAt:null,observation:null,suggestedFulfilled:null,createdDuringRoundId:null,updatedBy:actorId}).where(eq(gameGoals.gameId,gameId));
}
export async function deleteGoals(tx: Transaction, gameId: string) { await tx.delete(gameGoals).where(eq(gameGoals.gameId,gameId)); }
