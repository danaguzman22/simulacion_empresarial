"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "../domain/preparation";
import { configureSourceKpi } from "../repositories/configure-source-kpi.repository";
export type SourceKpiState={error?:string;success?:string};
export async function configureSourceKpiAction(_state:SourceKpiState,form:FormData):Promise<SourceKpiState>{
 try{
  const actor=await getAuthenticatedUserId(),gameId=String(form.get("gameId")),kpiId=String(form.get("kpiId")),operationId=String(form.get("operationId")),expectedRevision=Number(form.get("revision")),catalogToken=String(form.get("catalogToken")),origin=String(form.get("origin"));
  if(!actor||![gameId,kpiId,operationId].every(id=>UUID_PATTERN.test(id))||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=2147483647||!/^\w{64}$/.test(catalogToken)||(origin!=="inherited"&&origin!=="redefined"))throw new PreparationError("Datos inválidos. Recargá la preparación.");
  await configureSourceKpi(actor,{gameId,kpiId,operationId,expectedRevision,catalogToken,included:form.get("included")==="on",origin,value:String(form.get("value")??"")});
  revalidatePath(`/master/partidas/${gameId}`);return {success:"Configuración guardada."};
 }catch(error){if(error instanceof PreparationError)return {error:error.message};console.error("Error configurando KPI de origen",error);return {error:"No se pudo guardar. Recargá los datos antes de reintentar."};}
}
