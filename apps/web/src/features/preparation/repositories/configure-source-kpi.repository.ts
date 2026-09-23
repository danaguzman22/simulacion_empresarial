import { assertNoRuleDependency } from "@/features/rules/repositories/rule.repository";
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameGoals, gameKpis, gamePreparationChanges, gameStateSets, gameStateValues } from "@/db/schema";
import { access, hash, selectionContext } from "./preparation.repository";
import { predecessorKpis } from "./inherited-kpis";
import { normalizeValue, PreparationError } from "../domain/preparation";
export type SourceKpiInput = {gameId:string;kpiId:string;operationId:string;expectedRevision:number;catalogToken:string;included:boolean;origin:"inherited"|"redefined";value:string};
export async function configureSourceKpi(actorId:string,input:SourceKpiInput) {
 const requestHash=hash({actorId,...input});
 return db.transaction(async tx=>{
  const {game}=await access(tx,input.gameId,actorId,true);
  const [state]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,game.id),eq(gameStateSets.phase,"preparation"))).for("update");
  const [replay]=await tx.select().from(gamePreparationChanges).where(eq(gamePreparationChanges.operationId,input.operationId));
  if(replay){if(replay.requestHash!==requestHash||replay.actorId!==actorId||replay.stateSetId!==state?.id)throw new PreparationError("Identificador utilizado con otros datos.");return {replayed:true};}
  const context=await selectionContext(tx,game.campaignId,game.id);
  if(!state||state.frozenAt||!["draft","ready"].includes(game.status)||context.states.some(s=>s.gameId===game.id&&s.phase!=="preparation"))throw new PreparationError("La configuración ya está bloqueada.");
  if(state.revision!==input.expectedRevision||context.catalogToken!==input.catalogToken)throw new PreparationError("Cambió la preparación. Recargá los datos antes de continuar.");
  if(!["inherited","redefined"].includes(input.origin)||typeof input.included!=="boolean")throw new PreparationError("Configuración inválida.");
  const source=(await predecessorKpis(tx,game.id)).find(k=>k.id===input.kpiId),definition=context.catalog.find(k=>k.id===input.kpiId);
  if(!source||!definition)throw new PreparationError("El KPI no pertenece a la partida anterior.");
  const association=context.associations.find(k=>k.gameId===game.id&&k.kpiDefinitionId===input.kpiId);
  const [beforeValue]=await tx.select().from(gameStateValues).where(and(eq(gameStateValues.stateSetId,state.id),eq(gameStateValues.kpiDefinitionId,input.kpiId)));
  if(!input.included){
   await assertNoRuleDependency(tx,game.id,input.kpiId);
   const [goal]=await tx.select({id:gameGoals.id}).from(gameGoals).where(and(eq(gameGoals.gameId,game.id),eq(gameGoals.kpiDefinitionId,input.kpiId))).limit(1);
   if(goal)throw new PreparationError("Este KPI está siendo utilizado por una meta de la partida. Eliminá o modificá la meta antes de quitar el KPI.");
   await tx.delete(gameStateValues).where(and(eq(gameStateValues.stateSetId,state.id),eq(gameStateValues.kpiDefinitionId,input.kpiId)));
   await tx.delete(gameKpis).where(and(eq(gameKpis.gameId,game.id),eq(gameKpis.kpiDefinitionId,input.kpiId)));
  }
  let value:string|null=null;
  // Re-inclusion always starts from the source; redefining is a subsequent explicit choice.
  const origin=association?input.origin:"inherited";
  if(input.included){
   value=origin==="inherited"?source.value??source.ordinalKey:normalizeValue(input.value,definition);
   if(association)await tx.update(gameKpis).set({origin}).where(and(eq(gameKpis.gameId,game.id),eq(gameKpis.kpiDefinitionId,input.kpiId)));
   else await tx.insert(gameKpis).values({gameId:game.id,campaignId:game.campaignId,kpiDefinitionId:input.kpiId,required:source.required,origin,createdBy:actorId});
   if(value===null)await tx.delete(gameStateValues).where(and(eq(gameStateValues.stateSetId,state.id),eq(gameStateValues.kpiDefinitionId,input.kpiId)));
   else {const stored={value:definition.valueType==="numeric"?value:null,ordinalKey:definition.valueType==="ordinal"?value:null};await tx.insert(gameStateValues).values({gameId:game.id,campaignId:game.campaignId,stateSetId:state.id,kpiDefinitionId:input.kpiId,...stored}).onConflictDoUpdate({target:[gameStateValues.stateSetId,gameStateValues.kpiDefinitionId],set:stored});}
  }
  const revision=state.revision+1;
  await tx.update(gameStateSets).set({revision,updatedBy:actorId,updatedAt:new Date()}).where(eq(gameStateSets.id,state.id));
  await tx.insert(gamePreparationChanges).values({operationId:input.operationId,campaignId:game.campaignId,stateSetId:state.id,actorId,operation:"save_values",requestHash,previousRevision:state.revision,revision,details:{action:"configure_source_kpi",kpiId:input.kpiId,sourceStateSetId:source.sourceId,before:{association:association??null,value:beforeValue??null},after:{included:input.included,origin:input.included?origin:null,value}}});
  return {replayed:false};
 });
}
