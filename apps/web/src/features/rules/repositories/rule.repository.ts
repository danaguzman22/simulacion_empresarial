import "server-only";
import { and,asc,eq,sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { gameRules,gameRuleEffects,gameRuleExecutions,gameKpiChanges,gameStateSets,gameStateValues,kpiDefinitions,rounds } from "@/db/schema";
import { access,selectionContext,type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { RuleError,validateRule,type RuleDefinition } from "../domain/rule";

export async function assertNoRuleDependency(tx:Transaction,gameId:string|null,kpiId:string){
 const [row]=await tx.select({name:gameRules.name}).from(gameRuleEffects).innerJoin(gameRules,eq(gameRules.id,gameRuleEffects.ruleId)).where(and(gameId?eq(gameRuleEffects.gameId,gameId):undefined,eq(gameRuleEffects.kpiDefinitionId,kpiId)));
 if(row)throw new RuleError(`Este indicador es utilizado por la regla automática "${row.name}". Resolvé primero la regla.`);
}
export async function validateGameRules(tx:Transaction,gameId:string,campaignId:string){
 const context=await selectionContext(tx,campaignId,gameId);
 const rules=await tx.select().from(gameRules).where(and(eq(gameRules.gameId,gameId),eq(gameRules.enabled,true)));
 const effects=await tx.select().from(gameRuleEffects).where(eq(gameRuleEffects.gameId,gameId));
 const [prep]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,gameId),eq(gameStateSets.phase,"preparation")));
 const values=prep?await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId,prep.id)):[];
 for(const r of rules){const selected=effects.filter(e=>e.ruleId===r.id);validateRule({...r,effects:selected.map(e=>({kpiId:e.kpiDefinitionId,amount:e.amount}))},context.definitions);
  if(selected.some(e=>!values.some(v=>v.kpiDefinitionId===e.kpiDefinitionId&&v.value!==null)))throw new RuleError(`Configurá los valores iniciales usados por "${r.name}".`);
 }
}
export async function mutateRule(actorId:string,input:{gameId:string;ruleId:string;operation:"create"|"update"|"delete";expectedRevision?:number;definition?:RuleDefinition}){
 return db.transaction(async tx=>{
  const {game,role}=await access(tx,input.gameId,actorId,true);if(role!=="master")throw new RuleError("Solo Master puede configurar reglas.");
  const [prep]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,game.id),eq(gameStateSets.phase,"preparation"))).for("update");
  if(!["draft","ready"].includes(game.status)||!prep||prep.frozenAt)throw new RuleError("Las reglas solo se configuran antes de iniciar la partida.");
  await tx.execute(sql`select set_config('nexus.rule_actor',${actorId},true)`);
  const [old]=await tx.select().from(gameRules).where(eq(gameRules.id,input.ruleId)).for("update");
  if(old&&old.gameId!==game.id)throw new RuleError("Regla inválida.");
  if(input.operation==="delete"&&!old)return {replayed:true};
  if(input.operation!=="create"&&(!old||old.revision!==input.expectedRevision))throw new RuleError("La regla cambió. Actualizá los datos.");
  if(input.operation==="delete"){await tx.delete(gameRuleEffects).where(eq(gameRuleEffects.ruleId,old!.id));await tx.delete(gameRules).where(eq(gameRules.id,old!.id));return {replayed:false};}
  const definition=validateRule(input.definition!, (await selectionContext(tx,game.campaignId,game.id)).definitions);
  const {effects,...fields}=definition;
  if(input.operation==="create"&&old){
   const saved=await tx.select().from(gameRuleEffects).where(eq(gameRuleEffects.ruleId,old.id));
   if(old.createdBy!==actorId||old.revision!==0||Object.entries(fields).some(([k,v])=>old[k as keyof typeof old]!==v)||saved.length!==effects.length||effects.some(e=>!saved.some(s=>s.kpiDefinitionId===e.kpiId&&s.amount===e.amount)))throw new RuleError("El identificador ya se utilizó con otros datos.");
   return {replayed:true};
  }
  if(old){await tx.update(gameRules).set({...fields,revision:old.revision+1,updatedBy:actorId}).where(eq(gameRules.id,old.id));await tx.delete(gameRuleEffects).where(eq(gameRuleEffects.ruleId,old.id));}
  else await tx.insert(gameRules).values({...fields,id:input.ruleId,gameId:game.id,campaignId:game.campaignId,createdBy:actorId,updatedBy:actorId});
  if(effects.length)await tx.insert(gameRuleEffects).values(effects.map(e=>({ruleId:input.ruleId,gameId:game.id,campaignId:game.campaignId,kpiDefinitionId:e.kpiId,amount:e.amount})));
  return {replayed:false};
 });
}
export async function copyGameRules(tx:Transaction,previousId:string,gameId:string,campaignId:string,actorId:string){
 await tx.execute(sql`select set_config('nexus.rule_actor',${actorId},true)`);
 const rules=await tx.select().from(gameRules).where(eq(gameRules.gameId,previousId));const effects=await tx.select().from(gameRuleEffects).where(eq(gameRuleEffects.gameId,previousId));
 for(const r of rules){await tx.execute(sql`select set_config('nexus.rule_copy_id',${r.id},true)`);const id=randomUUID();await tx.insert(gameRules).values({id,gameId,campaignId,name:r.name,description:r.description,triggerType:r.triggerType,enabled:r.enabled,position:r.position,visibility:r.visibility,displayMessage:r.displayMessage,createdBy:actorId,updatedBy:actorId});
  const selected=effects.filter(e=>e.ruleId===r.id);if(selected.length)await tx.insert(gameRuleEffects).values(selected.map(e=>({ruleId:id,gameId,campaignId,kpiDefinitionId:e.kpiDefinitionId,effectType:e.effectType,amount:e.amount})));
 }
}
export async function readRules(gameId:string,actorId:string){
 return db.transaction(async tx=>{
  const {game,role}=await access(tx,gameId,actorId,false);const context=await selectionContext(tx,game.campaignId,game.id);
  const [prep]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,game.id),eq(gameStateSets.phase,"preparation")));
  const rules=await tx.select().from(gameRules).where(eq(gameRules.gameId,game.id)).orderBy(asc(gameRules.position),asc(gameRules.id));const effects=await tx.select().from(gameRuleEffects).where(eq(gameRuleEffects.gameId,game.id));
  const executions=await tx.select({execution:gameRuleExecutions,sequence:rounds.sequence,name:gameRules.name,message:gameRules.displayMessage}).from(gameRuleExecutions).innerJoin(rounds,eq(rounds.id,gameRuleExecutions.roundId)).innerJoin(gameRules,eq(gameRules.id,gameRuleExecutions.ruleId)).where(eq(gameRuleExecutions.gameId,game.id)).orderBy(asc(gameRuleExecutions.revision));
  const changes=await tx.select({change:gameKpiChanges,name:kpiDefinitions.name,unit:kpiDefinitions.unit}).from(gameKpiChanges).innerJoin(kpiDefinitions,eq(kpiDefinitions.id,gameKpiChanges.kpiDefinitionId)).where(and(eq(gameKpiChanges.gameId,game.id),eq(gameKpiChanges.source,"rule")));
  return {gameId,canEdit:role==="master"&&["draft","ready"].includes(game.status)&&!!prep&&!prep.frozenAt,periodLabel:game.periodLabel??"Ronda",
   kpis:context.definitions.filter(d=>d.valueType==="numeric").map(d=>({id:d.id,name:d.name,unit:d.unit})),
   rules:rules.map(r=>({...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),effects:effects.filter(e=>e.ruleId===r.id).map(e=>({kpiId:e.kpiDefinitionId,amount:e.amount}))})),
   executions:executions.map(({execution:e,sequence,name,message})=>({id:e.id,name,message,sequence,reason:e.reason,executedAt:e.executedAt.toISOString(),effects:changes.filter(c=>c.change.ruleExecutionId===e.id).map(({change:c,name,unit})=>({id:c.id,name,unit,amount:c.amount!,before:(c.before as {value:string}).value,after:(c.after as {value:string}).value}))}))};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
