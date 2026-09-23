"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError,UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { mutateRule,readRules } from "../repositories/rule.repository";
import { RuleError,effectAmount } from "../domain/rule";
export type RuleActionState={error?:string;success?:string};
export async function getRules(gameId:string){const actor=await getAuthenticatedUserId();if(!actor||!UUID_PATTERN.test(gameId))return null;return readRules(gameId,actor);}
export async function ruleAction(_previous:RuleActionState,form:FormData):Promise<RuleActionState>{
 try{
  const actor=await getAuthenticatedUserId();if(!actor)throw new RuleError("Tu sesión venció.");
  const text=(key:string)=>{const v=form.get(key);if(typeof v!=="string")throw new RuleError("Datos inválidos.");return v;};
  const gameId=text("gameId"),ruleId=text("ruleId"),operation=text("operation");
  if(!UUID_PATTERN.test(gameId)||!UUID_PATTERN.test(ruleId)||!["create","update","delete"].includes(operation))throw new RuleError("Regla inválida.");
  const revision=form.get("revision"),expectedRevision=revision===null?undefined:Number(revision);
  if(operation!=="create"&&(!/^\d+$/.test(String(revision))||!Number.isSafeInteger(expectedRevision)))throw new RuleError("Revisión inválida.");
  if(operation==="delete"&&form.get("confirmed")!=="on")throw new RuleError("Confirmá la eliminación.");
  const ids=form.getAll("kpiId"),rawAmounts=form.getAll("magnitude"),directions=form.getAll("direction");if(rawAmounts.length!==directions.length)throw new RuleError("Efectos inv?lidos.");const amounts=rawAmounts.map((v,i)=>effectAmount(String(directions[i]),String(v)));if(ids.length!==amounts.length||ids.some(v=>typeof v!=="string")||amounts.some(v=>typeof v!=="string"))throw new RuleError("Efectos inválidos.");
  await mutateRule(actor,{gameId,ruleId,operation:operation as "create"|"update"|"delete",expectedRevision,reason:String(form.get("reason")??""),runtimeEffects:form.get("runtime")==="true"?ids.map((id,i)=>({kpiId:id as string,amount:amounts[i]})):undefined,definition:form.get("runtime")==="true"?undefined:operation==="delete"?undefined:{name:text("name"),description:text("description"),triggerType:text("triggerType"),enabled:form.get("enabled")==="on",position:Number(text("position")),visibility:form.get("visible")==="on"?"display":"master_only",displayMessage:text("displayMessage"),effects:ids.map((id,i)=>({kpiId:id as string,amount:amounts[i] as string}))}});
  revalidatePath(`/master/partidas/${gameId}`);return {success:operation==="delete"?"Regla eliminada.":"Regla guardada."};
 }catch(error){if(error instanceof PreparationError)return {error:error.message};console.error("Error configurando regla",error);return {error:"No se pudo guardar. Actualizá los datos antes de reintentar."};}
}
