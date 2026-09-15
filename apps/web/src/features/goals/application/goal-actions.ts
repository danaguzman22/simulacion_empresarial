"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { GoalError, type GoalDefinition } from "../domain/goal";
import { mutateGoal, readGoals, type GoalInput } from "../repositories/goal.repository";
export type GoalActionState = {error?:string;success?:string};
export async function getGoals(gameId: string) { const actor = await getAuthenticatedUserId(); if (!actor) return null; return readGoals(gameId,actor); }
export async function goalAction(_state: GoalActionState, form: FormData): Promise<GoalActionState> {
  try {
    const actor = await getAuthenticatedUserId();
    const gameId = String(form.get("gameId")), operationId = String(form.get("operationId")), operation = String(form.get("operation")) as GoalInput["operation"];
    const goalId = form.get("goalId") ? String(form.get("goalId")) : undefined;
    const revision = Number(form.get("revision"));
    if (!actor || !UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId) || !["create","update","delete","evaluate"].includes(operation) || (operation !== "create" && (!goalId || !UUID_PATTERN.test(goalId) || !Number.isSafeInteger(revision) || revision < 1))) throw new GoalError("Datos inválidos. Recargá la página.");
    if (operation === "delete" && form.get("confirmed") !== "on") throw new GoalError("Confirmá que querés eliminar esta meta.");
    const type = String(form.get("goalType"));
    const valueType = String(form.get("valueType"));
    const definition = operation === "create" || operation === "update" ? {
      title:String(form.get("title") ?? ""),description:String(form.get("description") ?? ""),goalType:type,
      kpiDefinitionId:type === "kpi" ? String(form.get("kpiDefinitionId")) : null,
      operator:type === "kpi" ? valueType === "ordinal" ? "=" : String(form.get("operator")) : null,
      numericTarget:type === "kpi" && valueType === "numeric" ? String(form.get("target") ?? "") : null,
      ordinalTargetKey:type === "kpi" && valueType === "ordinal" ? String(form.get("target") ?? "") : null,
    } as GoalDefinition : undefined;
    if (definition?.kpiDefinitionId && !UUID_PATTERN.test(definition.kpiDefinitionId)) throw new GoalError("Seleccioná un KPI válido.");
    const fulfilled = String(form.get("fulfilled"));
    if (operation === "evaluate" && !["true","false"].includes(fulfilled)) throw new GoalError("Indicá si la meta se cumplió.");
    await mutateGoal(actor,{gameId,operationId,operation,goalId,expectedRevision:revision,definition,...(operation === "evaluate" ? {fulfilled:fulfilled === "true",observation:String(form.get("observation") ?? "")} : {})});
    revalidatePath(`/master/partidas/${gameId}`);
    return {success:"Meta guardada."};
  } catch (error) {
    if (error instanceof GoalError || error instanceof PreparationError) return {error:error.message};
    console.error("Error guardando meta",error);return {error:"No se pudo guardar. Recargá los datos antes de reintentar."};
  }
}
