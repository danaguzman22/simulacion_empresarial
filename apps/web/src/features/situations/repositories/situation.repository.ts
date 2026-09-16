import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameSituations, gameKpiChanges, gameStateSets, gameStateValues, kpiDefinitions, profiles, rounds } from "@/db/schema";
import { access, hash, selectionContext } from "@/features/preparation/repositories/preparation.repository";
import { planNumericEffects, applyNumericEffects } from "@/features/effects/repositories/numeric-effects";
import { SituationError, validateSituation, type SituationInput } from "../domain/situation";

export async function publishSituation(actorId: string, input: SituationInput) {
  validateSituation(input);
  const requestHash=hash({actorId,...input});
  return db.transaction(async tx=>{
    const {game,role}=await access(tx,input.gameId,actorId,true);
    if(role!=="master") throw new SituationError("Solo el Master puede publicar situaciones.");
    const [replay]=await tx.select().from(gameSituations).where(eq(gameSituations.operationId,input.operationId));
    if(replay){
      if(replay.requestHash!==requestHash || replay.actorId!==actorId || replay.gameId!==game.id) throw new SituationError("La operación ya fue utilizada con otros datos.");
      return {id:replay.id,revision:replay.revision,replayed:true};
    }
    if(!["active","paused"].includes(game.status)) throw new SituationError("La partida debe estar activa o pausada.");
    const [current]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,game.id),eq(gameStateSets.phase,"current"))).for("update");
    if(!current || current.frozenAt || current.revision!==input.expectedRevision) throw new SituationError("El estado actual cambió. Actualizá los datos antes de publicar.");
    const [round]=await tx.select().from(rounds).where(and(eq(rounds.gameId,game.id),sql`${rounds.status} in ('active','paused')`,sql`(${rounds.status}='paused' or ${rounds.endsAt}>clock_timestamp())`)).for("update");
    if(!round) throw new SituationError("Necesitás un período vigente, en curso o pausado.");
    const plan=await planNumericEffects(tx,game.id,game.campaignId,current.id,input.effects);
    const revision=current.revision+(plan.length?1:0);
    const [situation]=await tx.insert(gameSituations).values({gameId:game.id,campaignId:game.campaignId,roundId:round.id,stateSetId:current.id,actorId,operationId:input.operationId,requestHash,title:input.title.trim(),description:input.description.trim(),visibility:input.visibility,previousRevision:current.revision,revision,effectCount:plan.length}).returning();
    await applyNumericEffects(tx,plan,{gameId:game.id,campaignId:game.campaignId,stateSetId:current.id,roundId:round.id,actorId,revision,requestHash,source:"situation",situationId:situation.id});
    return {id:situation.id,revision,replayed:false};
  });
}

export async function readSituations(gameId:string,actorId:string){
  return db.transaction(async tx=>{
    const {game,role}=await access(tx,gameId,actorId,false);
    const [current]=await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId,game.id),eq(gameStateSets.phase,"current")));
    const [round]=await tx.select().from(rounds).where(and(eq(rounds.gameId,game.id),sql`${rounds.status} in ('active','paused')`,sql`(${rounds.status}='paused' or ${rounds.endsAt}>clock_timestamp())`));
    const context=await selectionContext(tx,game.campaignId,game.id);
    const values=current?await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId,current.id)):[];
    const entries=await tx.select({situation:gameSituations,sequence:rounds.sequence,author:profiles.displayName}).from(gameSituations).innerJoin(rounds,eq(rounds.id,gameSituations.roundId)).innerJoin(profiles,eq(profiles.id,gameSituations.actorId)).where(eq(gameSituations.gameId,game.id)).orderBy(asc(gameSituations.publishedAt),asc(gameSituations.id));
    const effects=await tx.select({change:gameKpiChanges,name:kpiDefinitions.name,unit:kpiDefinitions.unit}).from(gameKpiChanges).innerJoin(kpiDefinitions,eq(kpiDefinitions.id,gameKpiChanges.kpiDefinitionId)).where(and(eq(gameKpiChanges.gameId,game.id),eq(gameKpiChanges.source,"situation")));
    return {revision:current?.revision??0,canPublish:role==="master"&&["active","paused"].includes(game.status)&&!!round&&!!current&&!current.frozenAt,
      periodLabel:game.periodLabel??"Ronda",kpis:context.definitions.filter(d=>d.valueType==="numeric"&&values.some(v=>v.kpiDefinitionId===d.id&&v.value!==null)).map(d=>({id:d.id,name:d.name,unit:d.unit})),
      situations:entries.map(({situation:s,sequence,author})=>({id:s.id,title:s.title,description:s.description,visibility:s.visibility,sequence,author,publishedAt:s.publishedAt.toISOString(),effects:effects.filter(e=>e.change.situationId===s.id).map(({change:c,name,unit})=>({id:c.id,name,unit,amount:c.amount!,before:(c.before as {value:string}).value,after:(c.after as {value:string}).value}))}))};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
