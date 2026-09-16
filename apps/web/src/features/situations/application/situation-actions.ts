"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { publishSituation, readSituations } from "../repositories/situation.repository";
import { SituationError } from "../domain/situation";
export type SituationActionState={error?:string;success?:string;revision?:number};
export async function getSituations(gameId:string){
  const actor=await getAuthenticatedUserId();
  if(!actor||!UUID_PATTERN.test(gameId))return null;
  return readSituations(gameId,actor);
}
export async function publishSituationAction(_previous:SituationActionState,form:FormData):Promise<SituationActionState>{
  try{
    const actor=await getAuthenticatedUserId();
    if(!actor)throw new SituationError("Tu sesión venció. Volvé a iniciar sesión.");
    const text=(key:string)=>{const value=form.get(key);if(typeof value!=="string")throw new SituationError("Datos inválidos.");return value;};
    const gameId=text("gameId"),revision=text("revision");
    if(!/^\d+$/.test(revision))throw new SituationError("Revisión inválida.");
    const ids=form.getAll("kpiId"),amounts=form.getAll("amount");
    if(ids.length!==amounts.length||ids.some(v=>typeof v!=="string")||amounts.some(v=>typeof v!=="string"))throw new SituationError("Efectos inválidos.");
    const result=await publishSituation(actor,{gameId,operationId:text("operationId"),expectedRevision:Number(revision),title:text("title"),description:text("description"),visibility:"display",effects:ids.map((id,i)=>({kpiId:id as string,amount:amounts[i] as string}))});
    revalidatePath(`/master/partidas/${gameId}`);
    return {success:"Situación publicada.",revision:result.revision};
  }catch(error){
    if(error instanceof PreparationError)return {error:error.message};
    console.error("Error publicando situación",error);
    return {error:"No se pudo publicar. Actualizá los datos antes de reintentar."};
  }
}
