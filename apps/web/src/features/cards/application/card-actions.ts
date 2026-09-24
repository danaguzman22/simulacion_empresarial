"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { gameCardFields, type CardScope } from "../domain/card";
import { createModifierDefinition, createResponsibility, addCardToGame, readCards, saveCard } from "../repositories/card.repository";

export type CardActionState = { error?: string; success?: string };
export async function getCards(scope: CardScope) {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { status: "unauthenticated" } as const;
  try { return { status: "found", data: await readCards(scope, actor) } as const; }
  catch (error) { if (error instanceof PreparationError) return { status: "not-found" } as const; throw error; }
}
export async function cardAction(_previous: CardActionState, form: FormData): Promise<CardActionState> {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { error: "Tu sesión venció. Volvé a ingresar." };
  const kind = form.get("kind"), id = String(form.get("scopeId") ?? "");
  if (kind !== "campaign" && kind !== "game") return { error: "Configuración inválida." };
  try {
    if (form.get("operation") === "add" && kind === "game") await addCardToGame(id, actor, String(form.get("sourceId") ?? ""));
    else if (form.get("operation") === "save") {
      const cardId = String(form.get("cardId") ?? "");
      let structure: unknown;
      try { structure = JSON.parse(String(form.get("structure") ?? "")); } catch { return { error: "Configuración de ficha inválida." }; }
      await saveCard({ kind, id }, actor, { id: cardId || undefined, revision: Number(form.get("revision")), selectedResponsibilities: form.getAll("responsibility"), structure, fields: Object.fromEntries(gameCardFields.map(field => [field, String(form.get(field) ?? "")])) });
    } else return { error: "Operación inválida." };
    revalidatePath(kind === "game" ? `/master/partidas/${id}` : `/master/campanas/${id}`);
    return { success: "Ficha guardada." };
  } catch (error) {
    if (error instanceof PreparationError) return { error: error.message };
    console.error("Error guardando ficha", error);
    return { error: "No se pudo guardar. Recargá los datos antes de reintentar." };
  }
}

export async function addModifierAction(scope: CardScope, name: string, abbreviation: string) {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { error: "Tu sesión venció." };
  if (!scope || !["campaign", "game"].includes(scope.kind)) return { error: "Configuración inválida." };
  try { return { definition: await createModifierDefinition(scope,actor,name,abbreviation) }; }
  catch (error) { return { error: error instanceof PreparationError ? error.message : "No se pudo guardar el modificador." }; }
}

export async function addResponsibilityAction(scope: CardScope, label: string): Promise<{ label?: string; error?: string }> {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { error: "Tu sesión venció." };
  if (!scope || !["campaign", "game"].includes(scope.kind) || typeof label !== "string") return { error: "Responsabilidad inválida." };
  try { return { label: await createResponsibility(scope, actor, label) }; }
  catch (error) { return { error: error instanceof PreparationError ? error.message : "No se pudo guardar la responsabilidad." }; }
}
