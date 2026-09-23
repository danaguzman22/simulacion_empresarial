import "server-only";
import { and,asc,eq,sql } from "drizzle-orm";
import { gameRules,gameRuleEffects,gameRuleExecutions,gameStateSets } from "@/db/schema";
import { hash,type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { planNumericEffects,applyNumericEffects } from "@/features/effects/repositories/numeric-effects";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { RuleError } from "../domain/rule";

export async function executeRoundRules(tx:Transaction,input:{gameId:string;campaignId:string;roundId:string;closeOperationId:string;reason:"manual"|"timer";actorId:string|null}){
 const rules=await tx.select().from(gameRules).where(and(eq(gameRules.gameId,input.gameId),eq(gameRules.enabled,true))).orderBy(asc(gameRules.position),asc(gameRules.id));
 if(!rules.length)return;
 const [current]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,input.gameId),eq(gameStateSets.phase,"current"))).for("update");
 if(!current||current.frozenAt)throw new RuleError("El estado actual no permite ejecutar reglas.");
 let revision=current.revision;
 for(const rule of rules){
  try{
   const effects=await tx.select().from(gameRuleEffects).where(eq(gameRuleEffects.ruleId,rule.id)).orderBy(asc(gameRuleEffects.kpiDefinitionId));
   if(rule.triggerType!=="round_end"||!effects.length)throw new RuleError("La configuración de la regla no es válida.");
   const plan=await planNumericEffects(tx,input.gameId,input.campaignId,current.id,effects.map(e=>({kpiId:e.kpiDefinitionId,amount:e.amount})));
   const [execution]=await tx.insert(gameRuleExecutions).values({...input,ruleId:rule.id,stateSetId:current.id,previousRevision:revision,revision:revision+1,effectCount:plan.length}).returning();
   revision++;
   await applyNumericEffects(tx,plan,{gameId:input.gameId,campaignId:input.campaignId,roundId:input.roundId,actorId:input.actorId,stateSetId:current.id,revision,requestHash:hash(input),source:"rule",ruleExecutionId:execution.id});
   // Validate this transition before another rule changes CURRENT. This is NOT a commit.
   // The execution/round completion checks remain deferred until the entire close commits.
   await tx.execute(sql`SET CONSTRAINTS game_state_values_current_kpi_audited, game_state_sets_current_kpi_audited, game_rule_effect_applied IMMEDIATE`);
   await tx.execute(sql`SET CONSTRAINTS game_state_values_current_kpi_audited, game_state_sets_current_kpi_audited, game_rule_effect_applied DEFERRED`);
  }catch(error){if(error instanceof PreparationError)throw new RuleError(`No se pudo cerrar el período: regla "${rule.name}". ${error.message}`);throw error;}
 }
}
