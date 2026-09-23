import { completeRound,moveToEvaluationIfComplete } from "./complete-round";
import { RuleError } from "@/features/rules/domain/rule";
import { gameStateSets } from "@/db/schema";
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { games,campaigns,rounds,roundChanges } from "@/db/schema";
import { access,hash,type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { canWritePreparation } from "@/features/preparation/domain/preparation";
import { assertTransition,RoundError,type RoundOperation } from "../domain/round";
type Round=typeof rounds.$inferSelect;
async function lock(tx:Transaction,gameId:string,actorId:string,write:boolean){
 const found=await access(tx,gameId,actorId,write);
 if(!write){await tx.select({id:campaigns.id}).from(campaigns).where(eq(campaigns.id,found.game.campaignId)).for("update");await tx.select({id:games.id}).from(games).where(eq(games.id,gameId)).for("update");return access(tx,gameId,actorId,false);}
 return found;
}
async function audit(tx:Transaction,row:Round,actorId:string|null,operation:string,operationId:string,requestHash:string,before:Round|null,reason?:"timer"|"manual"){
 await tx.insert(roundChanges).values({operationId,roundId:row.id,gameId:row.gameId,campaignId:row.campaignId,actorId,operation,revision:row.revision,requestHash,details:{before,after:row,...(reason?{reason}: {})}});
}
async function finishExpired(tx:Transaction,gameId:string){
 const expired=await tx.select().from(rounds).where(and(eq(rounds.gameId,gameId),eq(rounds.status,"active"),sql`${rounds.endsAt} <= clock_timestamp()`)).for("update");
 for(const old of expired)await completeRound(tx,old,{actorId:null,reason:"timer",operationId:randomUUID(),requestHash:hash({roundId:old.id,endsAt:old.endsAt,reason:"timer"})});
 await moveToEvaluationIfComplete(tx,gameId);return expired;
}
export async function readRounds(gameId:string,actorId:string){
 try{return await readRoundState(gameId,actorId,true,null);}catch(error){if(error instanceof RuleError)return readRoundState(gameId,actorId,false,error.message);throw error;}
}
async function readRoundState(gameId:string,actorId:string,processExpiry:boolean,closeError:string|null){
 return db.transaction(async tx=>{const {game,role}=await lock(tx,gameId,actorId,false);if(processExpiry)await finishExpired(tx,gameId);const [latestGame]=await tx.select({status:games.status,periodLabel:games.periodLabel}).from(games).where(eq(games.id,gameId));
 const rows=await tx.select().from(rounds).where(eq(rounds.gameId,gameId)).orderBy(asc(rounds.sequence));
 const time=await tx.execute<{now:Date}>(sql`select clock_timestamp() as now`);
 const [current]=await tx.select({revision:gameStateSets.revision}).from(gameStateSets).where(and(eq(gameStateSets.gameId,gameId),eq(gameStateSets.phase,"current")));
 return {closeError,currentRevision:current?.revision??0,periodLabel:latestGame?.periodLabel??game.periodLabel??"Ronda",gameStatus:latestGame?.status??game.status,canManage:latestGame?.status==="active"&&canWritePreparation(role),serverNow:new Date(time[0].now).toISOString(),rounds:rows.map(r=>({...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),startedAt:r.startedAt?.toISOString()??null,endsAt:r.endsAt?.toISOString()??null,pausedAt:r.pausedAt?.toISOString()??null,completedAt:r.completedAt?.toISOString()??null}))};
 });
}
export type RoundInput={gameId:string;roundId?:string;operationId:string;operation:RoundOperation;expectedRevision?:number};
export async function mutateRound(actorId:string,input:RoundInput){
 const requestHash=hash({actorId,...input});
 return db.transaction(async tx=>{const {game}=await lock(tx,input.gameId,actorId,true);
 const [replay]=await tx.select().from(roundChanges).where(eq(roundChanges.operationId,input.operationId));
 if(replay){if(replay.requestHash!==requestHash||replay.actorId!==actorId||replay.gameId!==game.id)throw new RoundError("Identificador de operación utilizado con otros datos.");return {replayed:true};}
 const expired=await finishExpired(tx,game.id);
 // Commit expiry before checking the submitted revision. The requested command
 // was not executed; only a matching operation ID above is an actual replay.
 if(expired.length)return {replayed:false,expired:true};

 const [old]=await tx.select().from(rounds).where(and(eq(rounds.id,input.roundId!),eq(rounds.gameId,game.id))).for("update");
 if(game.status!=="active")throw new RoundError("La partida debe estar activa.");
 if(!old||old.revision!==input.expectedRevision)throw new RoundError("La ronda cambió. Actualizá los datos antes de continuar.");
 assertTransition(old.status,input.operation);
 if(input.operation==="start"||input.operation==="resume"){
 const conflicts=await tx.select({id:rounds.id}).from(rounds).where(and(eq(rounds.gameId,game.id),sql`${rounds.id} <> ${old.id}`,sql`${rounds.status} in ('active','paused')`));
 if(conflicts.length)throw new RoundError("Ya hay una ronda en curso o pausada.");
 if(input.operation==="start"){const earlier=await tx.select({id:rounds.id}).from(rounds).where(and(eq(rounds.gameId,game.id),sql`${rounds.sequence} < ${old.sequence}`,sql`${rounds.status} <> 'completed'`));if(earlier.length)throw new RoundError("Primero deben finalizar las rondas anteriores.");}
 }
 if(input.operation==="finish"){await completeRound(tx,old,{actorId,operationId:input.operationId,requestHash,reason:"manual"});return {replayed:false};}
 const change=input.operation==="pause"?{status:"paused" as const}:{status:"active" as const};
 const [row]=await tx.update(rounds).set({...change,revision:old.revision+1}).where(eq(rounds.id,old.id)).returning();
 await audit(tx,row,actorId,input.operation,input.operationId,requestHash,old);

 return {replayed:false};
 });
}

export async function createConfiguredRounds(tx: Transaction, game: typeof games.$inferSelect, actorId: string, startOperationId: string) {
 if (!game.periodCount || !game.periodDurationSeconds || !game.periodLabel) throw new RoundError("Primero configurá los períodos.");
 for (let sequence = 1; sequence <= game.periodCount; sequence++) {
  const [row] = await tx.insert(rounds).values({ gameId: game.id, campaignId: game.campaignId, sequence, durationSeconds: game.periodDurationSeconds, createdBy: actorId }).returning();
  await audit(tx, row, actorId, "create", randomUUID(), hash({ startOperationId, sequence }), null);
 }
}
