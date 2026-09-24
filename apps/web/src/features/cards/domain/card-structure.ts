import { CardError, modifierKeys, responsibilityKey, type ModifierKey } from "./card";

export type CardModifier = { key: string; name: string; abbreviation: string; value: number };
export type ModifierDefinition = Omit<CardModifier, "value">;
export const builtInModifiers: ModifierDefinition[] = [
  { key: "ana", name: "Análisis", abbreviation: "ANA" },
  { key: "vis", name: "Visión Sistémica", abbreviation: "VIS" },
  { key: "neg", name: "Negociación", abbreviation: "NEG" },
  { key: "ope", name: "Operaciones", abbreviation: "OPE" },
  { key: "ada", name: "Adaptabilidad", abbreviation: "ADA" },
];
export const abilityTypes = { active: "Activa", passive: "Pasiva", support: "Soporte", interruption: "Interrupción", revelation: "Revelación" };
export type Ability = { name: string; type: keyof typeof abilityTypes; description: string; condition: string; useLimit: number | null; useScope: "round" | "game" | null };
export type Weakness = { name: string; description: string; condition: string; consequence: string };
export type Restriction = { name: string; description: string; condition: string; visibility: "public" | "private" };
export type CardStructure = { configuredModifiers: CardModifier[]; abilities: Ability[]; weaknesses: Weakness[]; restrictions: Restriction[] };

export function effectiveModifiers(card: { configuredModifiers?: CardModifier[] | null } & Partial<Record<ModifierKey, number | null>>): CardModifier[] {
  if (card.configuredModifiers !== undefined && card.configuredModifiers !== null) return card.configuredModifiers;
  return builtInModifiers.flatMap(m => {
    const value = card[m.key as ModifierKey];
    return value === null || value === undefined ? [] : [{ ...m, value }];
  });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CardError("Configuración de ficha inválida.");
  return value as Record<string, unknown>;
}
function text(value: unknown, required = false, max = 5000) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new CardError("Completá los campos requeridos y revisá su longitud.");
  return value.trim();
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 50) throw new CardError("Cada sección admite hasta 50 elementos.");
  return value.map(object);
}
export function validateModifierDefinition(name: unknown, abbreviation: unknown) {
  const definition = { name: text(name, true, 160), abbreviation: text(abbreviation, true, 16).toUpperCase() };
  if (!responsibilityKey(definition.name) || !/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(definition.abbreviation)) throw new CardError("Usá un nombre y una abreviatura de hasta 16 letras, números, guiones o guiones bajos.");
  if (builtInModifiers.some(m => responsibilityKey(m.name) === responsibilityKey(definition.name) || m.abbreviation === definition.abbreviation)) throw new CardError("Ese modificador ya existe entre las opciones prediseñadas.");
  return definition;
}
export function validateStructure(raw: unknown): CardStructure {
  const value = object(raw);
  const configuredModifiers = list(value.configuredModifiers).map(m => {
    const key = text(m.key, true, 64), name = text(m.name, true, 160), abbreviation = text(m.abbreviation, true, 16);
    if (!modifierKeys.includes(key as ModifierKey) && !/^custom:[0-9a-f-]{36}$/i.test(key)) throw new CardError("Modificador inválido.");
    if (typeof m.value !== "number" || !Number.isInteger(m.value) || m.value < -2147483648 || m.value > 2147483647) throw new CardError("Los modificadores deben tener un valor entero.");
    return { key, name, abbreviation, value: m.value };
  });
  if (new Set(configuredModifiers.map(m => m.key)).size !== configuredModifiers.length || new Set(configuredModifiers.map(m => m.abbreviation.toUpperCase())).size !== configuredModifiers.length) throw new CardError("No repitas modificadores o abreviaturas dentro de una ficha.");
  const abilities = list(value.abilities).map(a => {
    if (typeof a.type !== "string" || !Object.hasOwn(abilityTypes, a.type)) throw new CardError("Tipo de habilidad inválido.");
    if (a.useLimit === null ? a.useScope !== null : (typeof a.useLimit !== "number" || !Number.isInteger(a.useLimit) || a.useLimit < 1 || a.useLimit > 2147483647 || !["round", "game"].includes(String(a.useScope)))) throw new CardError("Indicá un límite positivo y su alcance, o dejá ambos sin límite.");
    return { name: text(a.name, true, 160), type: a.type as Ability["type"], description: text(a.description, true), condition: text(a.condition), useLimit: a.useLimit as number | null, useScope: a.useScope as Ability["useScope"] };
  });
  const weaknesses = list(value.weaknesses).map(w => ({ name: text(w.name, true, 160), description: text(w.description), condition: text(w.condition), consequence: text(w.consequence, true) }));
  const restrictions = list(value.restrictions).map(r => {
    if (r.visibility !== "public" && r.visibility !== "private") throw new CardError("Visibilidad inválida.");
    return { name: text(r.name, true, 160), description: text(r.description, true), condition: text(r.condition), visibility: r.visibility } as Restriction;
  });
  return { configuredModifiers, abilities, weaknesses, restrictions };
}
