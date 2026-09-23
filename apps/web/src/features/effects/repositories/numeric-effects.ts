import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { gameKpiChanges, gameStateSets, gameStateValues } from "@/db/schema";
import { selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { numericAdd } from "../domain/numeric-add";

/** Caller owns the transaction and game/current locks. No publication or UI logic. */
export async function planNumericEffects(tx: Transaction, gameId: string, campaignId: string, stateSetId: string, effects: Array<{kpiId:string;amount:string}>) {
  const { definitions } = await selectionContext(tx,campaignId,gameId);
  const values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId,stateSetId)).for("update");
  if (new Set(effects.map(e=>e.kpiId)).size!==effects.length) throw new PreparationError("No repitas un KPI en los efectos.");
  return effects.map(effect=>{
    const definition=definitions.find(d=>d.id===effect.kpiId), row=values.find(v=>v.kpiDefinitionId===effect.kpiId);
    if (!definition || !row || row.value===null) throw new PreparationError("El efecto requiere un KPI numérico seleccionado y configurado en el estado actual.");
    return {kpiId:definition.id,rowId:row.id,...numericAdd(row.value,effect.amount,definition)};
  });
}

export async function applyNumericEffects(tx: Transaction, plan: Awaited<ReturnType<typeof planNumericEffects>>, context: {
  gameId:string;campaignId:string;stateSetId:string;roundId:string;actorId:string|null;revision:number;requestHash:string;
} & ({source:"situation";situationId:string;actorId:string}|{source:"rule";ruleExecutionId:string})) {
  if (!plan.length) return;
  for (const effect of plan) await tx.update(gameStateValues).set({value:effect.after,updatedAt:new Date()}).where(and(eq(gameStateValues.id,effect.rowId),eq(gameStateValues.stateSetId,context.stateSetId)));
  await tx.update(gameStateSets).set({revision:context.revision,updatedBy:context.actorId,updatedAt:new Date()}).where(eq(gameStateSets.id,context.stateSetId));
  for (const effect of plan) await tx.insert(gameKpiChanges).values({ ...context,operationId:randomUUID(),kpiDefinitionId:effect.kpiId,effectType:"numeric_add",amount:effect.amount,
    before:{value:effect.before,ordinalKey:null,label:effect.before},after:{value:effect.after,ordinalKey:null,label:effect.after} });
}
