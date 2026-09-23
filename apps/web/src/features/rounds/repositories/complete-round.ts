import "server-only";
import { and,eq } from "drizzle-orm";
import { games,rounds,roundChanges } from "@/db/schema";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";
import { executeRoundRules } from "@/features/rules/repositories/rule-execution.repository";
import { RoundError } from "../domain/round";

/** Caller owns campaign/game/round locks and the enclosing transaction. */
export async function completeRound(tx:Transaction,old:typeof rounds.$inferSelect,input:{operationId:string;requestHash:string;actorId:string|null;reason:"manual"|"timer"}){
 if(!["active","paused"].includes(old.status))throw new RoundError("El período ya no está en curso.");
 await executeRoundRules(tx,{gameId:old.gameId,campaignId:old.campaignId,roundId:old.id,closeOperationId:input.operationId,actorId:input.actorId,reason:input.reason});
 const [row]=await tx.update(rounds).set({status:"completed",revision:old.revision+1,...(input.reason==="manual"?{completedAt:new Date()}: {})}).where(eq(rounds.id,old.id)).returning();
 await tx.insert(roundChanges).values({operationId:input.operationId,roundId:row.id,gameId:row.gameId,campaignId:row.campaignId,actorId:input.actorId,operation:"finish",revision:row.revision,requestHash:input.requestHash,details:{before:old,after:row,reason:input.reason}});
 await moveToEvaluationIfComplete(tx,old.gameId);
}
export async function moveToEvaluationIfComplete(tx:Transaction,gameId:string){
 const rows=await tx.select({status:rounds.status}).from(rounds).where(eq(rounds.gameId,gameId));
 if(rows.length&&rows.every(r=>r.status==="completed"))await tx.update(games).set({status:"evaluation"}).where(and(eq(games.id,gameId),eq(games.status,"active")));
}
