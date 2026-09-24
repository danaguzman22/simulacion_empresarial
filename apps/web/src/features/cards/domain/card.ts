import type { Ability, Weakness, Restriction, CardModifier } from "./card-structure";
import { PreparationError } from "@/features/preparation/domain/preparation";

export class CardError extends PreparationError {}
export const publicCardFields = ["name", "department", "description", "responsibilities", "publicInformation", "visualIdentity"] as const;
export const gameCardFields = [...publicCardFields, "individualObjective", "privateInformation", "secretObjective"] as const;
export type CardFields = Record<typeof gameCardFields[number], string>;
export const modifierKeys = ["ana", "vis", "neg", "ope", "ada"] as const;
export type ModifierKey = typeof modifierKeys[number];
export const modifierLabels = { ana: "ANA — Análisis", vis: "VIS — Visión", neg: "NEG — Negociación", ope: "OPE — Operaciones", ada: "ADA — Adaptabilidad" };
export type CardView = Pick<CardFields, typeof publicCardFields[number]> & Partial<Pick<CardFields, "individualObjective" | "privateInformation" | "secretObjective">> & { id: string; revision: number; selectedResponsibilities: string[] } & Record<ModifierKey, number | null> & { configuredModifiers: CardModifier[] | null; abilities: Ability[]; weaknesses: Weakness[]; restrictions: Restriction[] };
export type CardScope = { kind: "campaign" | "game"; id: string };
export function validateCard(value: Record<string, unknown>, game: boolean) {
  const result: Record<string, string> = {};
  for (const key of game ? gameCardFields : publicCardFields) {
    const raw = value[key];
    if (typeof raw !== "string") throw new CardError("Revisá los campos de la ficha.");
    const text = raw.trim(), max = ["name", "department", "visualIdentity"].includes(key) ? 160 : 5000;
    if (text.length > max || (key === "name" && !text)) throw new CardError(`Revisá ${key === "name" ? "el nombre" : "la longitud de los campos"} de la ficha.`);
    result[key] = text;
  }
  return result as CardFields;
}
export function canEditCards(role: string, editable = true) { return role === "master" && editable; }
export function cardsEditable(status: string, states: { phase: string; frozenAt: Date | null }[]) {
  return ["draft", "ready"].includes(status) && !states.some(s => s.phase !== "preparation" || s.frozenAt !== null);
}

export function responsibilityKey(label: string) {
  return label.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e").replace(/[íìïî]/g, "i")
    .replace(/[óòöô]/g, "o").replace(/[úùüû]/g, "u").replace(/[.!;:,]+$/g, "").trim();
}
export function selectedResponsibilities(card: { responsibilities: string; selectedResponsibilities?: string[] }) {
  return [...new Map([...(card.selectedResponsibilities ?? []), ...(card.responsibilities.trim() ? [card.responsibilities] : [])].map(label => [responsibilityKey(label), label])).values()];
}
export function validateResponsibilities(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some(v => typeof v !== "string" || !responsibilityKey(v) || v.length > 5000)) throw new CardError("Seleccioná hasta 50 responsabilidades válidas.");
  return [...new Map((value as string[]).map(label => [responsibilityKey(label), label.trim()])).values()];
}
export function validateModifiers(value: Record<string, unknown>) {
  return Object.fromEntries(modifierKeys.map(key => {
    const raw = value[key];
    if (raw === null || raw === "") return [key, null];
    const number = typeof raw === "number" ? raw : typeof raw === "string" && /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) throw new CardError("Los modificadores deben ser números enteros.");
    return [key, number];
  })) as Record<ModifierKey, number | null>;
}
