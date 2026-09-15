"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError,UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { readRounds,mutateRound,type RoundInput } from "../repositories/round.repository";
import { RoundError } from "../domain/round";
async function actor(gameId:string){if(!UUID_PATTERN.test(gameId))throw new RoundError("Partida inválida.");const id=await getAuthenticatedUserId();if(!id)throw new RoundError("Volvé a iniciar sesión.");return id;}
export async function getRounds(gameId:string){return readRounds(gameId,await actor(gameId));}
export async function roundAction(_previous:{error?:string;success?:string},form:FormData):Promise<{error?:string;success?:string}>{
 try{const gameId=String(form.get("gameId")),actorId=await actor(gameId),operation=String(form.get("operation")),operationId=String(form.get("operationId"));
 if(!UUID_PATTERN.test(operationId)||!["start","pause","resume","finish"].includes(operation))throw new RoundError("Operación inválida.");
 const input:RoundInput={gameId,operationId,operation:operation as RoundInput["operation"]};
 {input.roundId=String(form.get("roundId"));const revision=String(form.get("revision"));if(!UUID_PATTERN.test(input.roundId)||!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision))||Number(revision)>=2147483647)throw new RoundError("Revisión inválida.");input.expectedRevision=Number(revision);}
 await mutateRound(actorId,input);revalidatePath(`/master/partidas/${gameId}`);return {success:"Ronda actualizada."};
 }catch(error){if(error instanceof RoundError||error instanceof PreparationError)return {error:error.message};console.error("Error de ronda",error);return {error:"No se pudo realizar la operación. Actualizá los datos antes de reintentar."};}
}
