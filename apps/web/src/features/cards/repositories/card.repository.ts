import { requireCampaignInstitution } from "@/features/institutions/repositories/institution-access";
import { builtInModifiers, effectiveModifiers, validateStructure, validateModifierDefinition, type Restriction } from "../domain/card-structure";
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardModifierDefinitions, cardResponsibilities, campaignMembers, campaigns, campaignRoleCards, gameRoleCards, gameStateSets } from "@/db/schema";
import { access, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { CardError, responsibilityKey, validateResponsibilities, validateModifiers, canEditCards, cardsEditable, validateCard, type CardScope } from "../domain/card";

function validId(id: string) { if (!UUID_PATTERN.test(id)) throw new CardError("Ficha no disponible."); }
async function context(tx: Transaction, scope: CardScope, actor: string, write: boolean) {
  validId(scope.id);
  if (scope.kind === "game") {
    const { game, role } = await access(tx, scope.id, actor, write);
    const states = await tx.select({ phase: gameStateSets.phase, frozenAt: gameStateSets.frozenAt }).from(gameStateSets).where(eq(gameStateSets.gameId, game.id));
    return { campaignId: game.campaignId, role, editable: cardsEditable(game.status, states) };
  }
  if (write) await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, scope.id)).for("update");
  const query = tx.select({ role: campaignMembers.role }).from(campaignMembers).where(and(eq(campaignMembers.campaignId, scope.id), eq(campaignMembers.profileId, actor)));
  const [member] = write ? await query.for("share") : await query;
  if (!member || !["master", "co_master", "observer"].includes(member.role)) throw new CardError("No tenés acceso a estas fichas.");
  await requireCampaignInstitution(tx, scope.id, actor, write);
  return { campaignId: scope.id, role: member.role, editable: true };
}
function visibleRestrictions(column: typeof gameRoleCards.restrictions | typeof campaignRoleCards.restrictions, privateAccess: boolean) {
  return privateAccess ? column : sql<Restriction[]>`coalesce((select jsonb_agg(r) from jsonb_array_elements(${column}) r where r->>'visibility'='public'), '[]'::jsonb)`;
}
const publicColumns = {
  secretRevealLimit: gameRoleCards.secretRevealLimit, secretRevealSeconds: gameRoleCards.secretRevealSeconds,
  configuredModifiers: gameRoleCards.configuredModifiers, abilities: gameRoleCards.abilities, weaknesses: gameRoleCards.weaknesses,
  selectedResponsibilities: gameRoleCards.selectedResponsibilities, ana: gameRoleCards.ana, vis: gameRoleCards.vis, neg: gameRoleCards.neg, ope: gameRoleCards.ope, ada: gameRoleCards.ada,
  id: gameRoleCards.id, revision: gameRoleCards.revision, name: gameRoleCards.name, department: gameRoleCards.department,
  description: gameRoleCards.description, responsibilities: gameRoleCards.responsibilities,
  publicInformation: gameRoleCards.publicInformation, visualIdentity: gameRoleCards.visualIdentity, individualObjective: gameRoleCards.individualObjective,
};
export async function readCards(scope: CardScope, actor: string) {
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, actor, false);
    const canEdit = canEditCards(ctx.role, ctx.editable);
    const modifierCatalogue = canEdit ? await ownedModifiers(tx, actor) : [];
    const responsibilityCatalogue = canEdit ? await tx.select({ label: cardResponsibilities.label }).from(cardResponsibilities).where(eq(cardResponsibilities.ownerId, actor)).orderBy(asc(cardResponsibilities.normalizedLabel)) : [];
    if (scope.kind === "campaign") {
      const cards = await tx.select({
        ...(ctx.role === "master" ? { privateInformation: campaignRoleCards.privateInformation, secretObjective: campaignRoleCards.secretObjective } : {}),
        individualObjective: campaignRoleCards.individualObjective,
        configuredModifiers: campaignRoleCards.configuredModifiers, abilities: campaignRoleCards.abilities, weaknesses: campaignRoleCards.weaknesses,
        restrictions: visibleRestrictions(campaignRoleCards.restrictions, ctx.role === "master"),
        selectedResponsibilities: campaignRoleCards.selectedResponsibilities, ana: campaignRoleCards.ana, vis: campaignRoleCards.vis, neg: campaignRoleCards.neg, ope: campaignRoleCards.ope, ada: campaignRoleCards.ada, id: campaignRoleCards.id, revision: campaignRoleCards.revision, name: campaignRoleCards.name, department: campaignRoleCards.department, description: campaignRoleCards.description, responsibilities: campaignRoleCards.responsibilities, publicInformation: campaignRoleCards.publicInformation, visualIdentity: campaignRoleCards.visualIdentity }).from(campaignRoleCards).where(eq(campaignRoleCards.campaignId, ctx.campaignId)).orderBy(asc(campaignRoleCards.createdAt), asc(campaignRoleCards.id));
      return { cards, modifierCatalogue, responsibilityCatalogue, available: [], canEdit, canReadPrivate: ctx.role === "master", campaignId: ctx.campaignId };
    }
    // Private columns never enter the DTO/query for Co-Master or Observer.
    const columns = ctx.role === "master" ? { ...publicColumns, privateInformation: gameRoleCards.privateInformation, secretObjective: gameRoleCards.secretObjective } : publicColumns;
    const cards = await tx.select({ ...columns, restrictions: visibleRestrictions(gameRoleCards.restrictions, ctx.role === "master") }).from(gameRoleCards).where(and(eq(gameRoleCards.gameId, scope.id), eq(gameRoleCards.campaignId, ctx.campaignId))).orderBy(asc(gameRoleCards.createdAt), asc(gameRoleCards.id));
    const associated = await tx.select({ id: gameRoleCards.sourceCardId }).from(gameRoleCards).where(eq(gameRoleCards.gameId, scope.id));
    const catalogue = canEdit ? await tx.select({ id: campaignRoleCards.id, name: campaignRoleCards.name }).from(campaignRoleCards).where(eq(campaignRoleCards.campaignId, ctx.campaignId)).orderBy(asc(campaignRoleCards.name), asc(campaignRoleCards.id)) : [];
    const used = new Set(associated.map(c => c.id));
    return { cards, modifierCatalogue, responsibilityCatalogue, available: catalogue.filter(c => !used.has(c.id)), canEdit, canReadPrivate: ctx.role === "master", campaignId: ctx.campaignId };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function saveCard(scope: CardScope, actor: string, input: { id?: string; revision?: number; fields: Record<string, unknown>; selectedResponsibilities?: unknown; modifiers?: Record<string, unknown>; structure?: unknown }) {
  const content = validateCard(input.fields, scope.kind === "game");
  const responsibilities = input.selectedResponsibilities === undefined ? undefined : validateResponsibilities(input.selectedResponsibilities);
  const modifiers = input.modifiers === undefined ? {} : validateModifiers(input.modifiers);
  const structure = input.structure === undefined ? undefined : validateStructure(input.structure);
  const privateFields = scope.kind === "campaign" ? Object.fromEntries(["privateInformation", "individualObjective", "secretObjective"].filter(key => input.fields[key] !== undefined).map(key => {
    const value = input.fields[key]; if (typeof value !== "string" || value.length > 5000) throw new CardError("Objetivos o informaci\u00f3n privada inv\u00e1lidos."); return [key,value.trim()];
  })) : {};
  const fields = { ...content, ...privateFields, ...modifiers, ...structure, ...(responsibilities === undefined ? {} : { responsibilities: "", selectedResponsibilities: responsibilities }) };
  if (input.id) { validId(input.id); if (!Number.isSafeInteger(input.revision) || input.revision! < 0) throw new CardError("Revisión inválida."); }
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, actor, true);
    if (!canEditCards(ctx.role, ctx.editable)) throw new CardError("Solo el Master puede configurar fichas durante la preparación.");
    if (structure) {
      const table = scope.kind === "game" ? gameRoleCards : campaignRoleCards;
      const [existing] = input.id ? await tx.select().from(table).where(and(eq(table.id,input.id),eq(table.campaignId,ctx.campaignId))) : [];
      const allowed = new Map([...(await ownedModifiers(tx,actor)), ...(existing ? effectiveModifiers(existing) : []), ...builtInModifiers].map(m => [m.key,m]));
      for (const modifier of structure.configuredModifiers) {
        const definition = allowed.get(modifier.key);
        if (!definition || definition.name !== modifier.name || definition.abbreviation !== modifier.abbreviation) throw new CardError("El modificador no pertenece a tu cat\u00e1logo o a esta ficha.");
      }
    }
    if (responsibilities?.length) {
      // One catalogue write, sorted consistently across campaign transactions.
      const entries = responsibilities.map(label => ({ ownerId: actor, label, normalizedLabel: responsibilityKey(label) }))
        .sort((a, b) => a.normalizedLabel < b.normalizedLabel ? -1 : a.normalizedLabel > b.normalizedLabel ? 1 : 0);
      await tx.insert(cardResponsibilities).values(entries).onConflictDoNothing({ target: [cardResponsibilities.ownerId, cardResponsibilities.normalizedLabel] });
    }
    if (scope.kind === "game") {
      if (!input.id) throw new CardError("Primero agregá una ficha del catálogo de campaña.");
      const rows = await tx.update(gameRoleCards).set({ ...fields, revision: input.revision! + 1, updatedBy: actor, updatedAt: new Date() }).where(and(eq(gameRoleCards.id, input.id), eq(gameRoleCards.gameId, scope.id), eq(gameRoleCards.revision, input.revision!))).returning({ id: gameRoleCards.id });
      if (!rows.length) throw new CardError("La ficha cambió o ya no está disponible. Recargá los datos.");
    } else if (input.id) {
      const rows = await tx.update(campaignRoleCards).set({ ...fields, revision: input.revision! + 1, updatedBy: actor, updatedAt: new Date() }).where(and(eq(campaignRoleCards.id, input.id), eq(campaignRoleCards.campaignId, scope.id), eq(campaignRoleCards.revision, input.revision!))).returning({ id: campaignRoleCards.id });
      if (!rows.length) throw new CardError("La ficha cambió o ya no está disponible. Recargá los datos.");
    } else await tx.insert(campaignRoleCards).values({ ...fields, campaignId: scope.id, createdBy: actor, updatedBy: actor });
  });
}
function copiedFields(c: typeof campaignRoleCards.$inferSelect) {
  return { configuredModifiers: c.configuredModifiers, abilities: c.abilities, weaknesses: c.weaknesses, restrictions: c.restrictions, privateInformation: c.privateInformation, individualObjective: c.individualObjective, secretObjective: c.secretObjective, selectedResponsibilities: c.selectedResponsibilities, ana: c.ana, vis: c.vis, neg: c.neg, ope: c.ope, ada: c.ada, name: c.name, department: c.department, description: c.description, responsibilities: c.responsibilities, publicInformation: c.publicInformation, visualIdentity: c.visualIdentity };
}
// Called inside the existing campaign-locked creation transaction. No runtime data copied.
export async function copyCampaignCards(tx: Transaction, campaignId: string, gameId: string, actor: string, sourceId?: string) {
  const sources = await tx.select().from(campaignRoleCards).where(sourceId ? and(eq(campaignRoleCards.campaignId, campaignId), eq(campaignRoleCards.id, sourceId)) : eq(campaignRoleCards.campaignId, campaignId));
  if (sourceId && !sources.length) throw new CardError("Ficha base no disponible.");
  if (sources.length) await tx.insert(gameRoleCards).values(sources.map(c => ({ ...copiedFields(c), secretRevealLimit: 2, secretRevealSeconds: 10, campaignId, gameId, sourceCardId: c.id, createdBy: actor, updatedBy: actor }))).onConflictDoNothing({ target: [gameRoleCards.gameId, gameRoleCards.sourceCardId] });
}
export async function addCardToGame(gameId: string, actor: string, sourceId: string) {
  validId(sourceId);
  return db.transaction(async tx => {
    const ctx = await context(tx, { kind: "game", id: gameId }, actor, true);
    if (!canEditCards(ctx.role, ctx.editable)) throw new CardError("Solo el Master puede agregar fichas durante la preparación.");
    await copyCampaignCards(tx, ctx.campaignId, gameId, actor, sourceId);
  });
}
export async function copySuccessorCards(tx: Transaction, previousId: string, gameId: string, campaignId: string, actor: string) {
  const cards = await tx.select().from(gameRoleCards).where(and(eq(gameRoleCards.gameId, previousId), eq(gameRoleCards.campaignId, campaignId)));
  if (cards.length) await tx.insert(gameRoleCards).values(cards.map(c => ({ ...copiedFields(c), secretRevealLimit: c.secretRevealLimit ?? 2, secretRevealSeconds: c.secretRevealSeconds ?? 10, privateInformation: c.privateInformation, individualObjective: c.individualObjective, secretObjective: c.secretObjective, sourceCardId: c.sourceCardId, gameId, campaignId, createdBy: actor, updatedBy: actor })));
}

async function rememberResponsibility(tx: Transaction, actor: string, label: string) {
  await tx.insert(cardResponsibilities).values({ ownerId: actor, label, normalizedLabel: responsibilityKey(label) }).onConflictDoNothing({ target: [cardResponsibilities.ownerId, cardResponsibilities.normalizedLabel] });
  const [stored] = await tx.select({ label: cardResponsibilities.label }).from(cardResponsibilities).where(and(eq(cardResponsibilities.ownerId, actor), eq(cardResponsibilities.normalizedLabel, responsibilityKey(label))));
  return stored.label;
}
export async function createResponsibility(scope: CardScope, actor: string, raw: string) {
  const [label] = validateResponsibilities([raw]);
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, actor, true);
    if (!canEditCards(ctx.role, ctx.editable)) throw new CardError("Solo el Master puede agregar responsabilidades durante la configuración.");
    return rememberResponsibility(tx, actor, label);
  });
}

async function ownedModifiers(tx: Transaction, actor: string) {
  const rows = await tx.select({ id: cardModifierDefinitions.id, name: cardModifierDefinitions.name, abbreviation: cardModifierDefinitions.abbreviation }).from(cardModifierDefinitions).where(eq(cardModifierDefinitions.ownerId, actor)).orderBy(asc(cardModifierDefinitions.name));
  return rows.map(m => ({ key: `custom:${m.id}`, name: m.name, abbreviation: m.abbreviation }));
}
export async function createModifierDefinition(scope: CardScope, actor: string, name: string, abbreviation: string) {
  const definition = validateModifierDefinition(name, abbreviation);
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, actor, true);
    if (!canEditCards(ctx.role,ctx.editable)) throw new CardError("Solo el Master puede configurar modificadores durante la preparaci\u00f3n.");
    await tx.insert(cardModifierDefinitions).values({ ...definition, normalizedName: responsibilityKey(definition.name), ownerId: actor }).onConflictDoNothing();
    const [stored] = await tx.select().from(cardModifierDefinitions).where(and(eq(cardModifierDefinitions.ownerId,actor),eq(cardModifierDefinitions.normalizedName,responsibilityKey(definition.name))));
    if (!stored || stored.abbreviation !== definition.abbreviation) throw new CardError("El nombre o la abreviatura ya est\u00e1n usados. Eleg\u00ed la definici\u00f3n existente u otros datos.");
    return { key: `custom:${stored.id}`, name: stored.name, abbreviation: stored.abbreviation };
  });
}
