import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { games, gameStateSets, gameStateValues, gamePreparationChanges } from "@/db/schema";
import { access, selectionContext, hash } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { canStartGame, validateStartValues } from "../domain/start-game";

export type StartGameInput = { gameId: string; operationId: string; expectedRevision: number; catalogToken: string };
export async function startGame(actorId: string, input: StartGameInput) {
  const requestHash = hash({ actorId, ...input });
  return db.transaction(async tx => {
    // Same campaign -> game -> preparation locking order as preparation writes.
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const [previous] = await tx.select().from(gamePreparationChanges).where(eq(gamePreparationChanges.operationId, input.operationId));
    const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, game.id)).for("update");
    const prep = states.find(s => s.phase === "preparation");
    if (previous) {
      if (previous.operation !== "start_game" || previous.requestHash !== requestHash || previous.actorId !== actorId || previous.stateSetId !== prep?.id) {
        throw new PreparationError("La operación ya fue utilizada con otros datos.");
      }
      return { replayed: true };
    }
    if (!canStartGame(role, game.status)) throw new PreparationError("La partida ya comenzó o no puede iniciarse en su estado actual.");
    if (!prep || prep.frozenAt) throw new PreparationError("Primero guardá una preparación editable.");
    if (states.some(s => s.phase !== "preparation")) throw new PreparationError("La partida ya tiene estados históricos o actuales; no puede iniciarse de nuevo.");
    if (prep.revision !== input.expectedRevision) throw new PreparationError("Cambió la preparación. Recargá los datos antes de iniciar.");
    const context = await selectionContext(tx, game.campaignId, game.id);
    if (context.catalogToken !== input.catalogToken) throw new PreparationError("Cambió la selección o el catálogo. Recargá los datos antes de iniciar.");
    const [other] = await tx.select({ id: games.id }).from(games).where(and(eq(games.campaignId, game.campaignId), ne(games.id, game.id), inArray(games.status, ["active", "paused"])));
    if (other) throw new PreparationError("Ya hay otra partida activa o pausada en esta campaña.");
    const values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, prep.id));
    validateStartValues(context.definitions, values);
    const now = new Date();
    const ids: Partial<Record<"initial" | "current", string>> = {};
    for (const phase of ["initial", "current"] as const) {
      const [created] = await tx.insert(gameStateSets).values({ gameId: game.id, campaignId: game.campaignId, phase, sourceStateSetId: prep.sourceStateSetId, createdBy: actorId, updatedBy: actorId }).returning({ id: gameStateSets.id });
      ids[phase] = created.id;
      if (values.length) await tx.insert(gameStateValues).values(values.map(v => ({ gameId: game.id, campaignId: game.campaignId, stateSetId: created.id, kpiDefinitionId: v.kpiDefinitionId, value: v.value, ordinalKey: v.ordinalKey })));
      if (phase === "initial") await tx.update(gameStateSets).set({ frozenAt: now }).where(eq(gameStateSets.id, created.id));
    }
    const revision = prep.revision + 1;
    await tx.update(gameStateSets).set({ frozenAt: now, revision, updatedBy: actorId, updatedAt: now }).where(eq(gameStateSets.id, prep.id));
    await tx.insert(gamePreparationChanges).values({ operationId: input.operationId, campaignId: game.campaignId, stateSetId: prep.id, actorId, operation: "start_game", requestHash, previousRevision: prep.revision, revision, details: { initialStateSetId: ids.initial, currentStateSetId: ids.current, preparationRevision: prep.revision } });
    await tx.update(games).set({ status: "active", startedAt: now, updatedAt: now }).where(eq(games.id, game.id));
    return { replayed: false };
  }, { isolationLevel: "read committed" });
}

export async function readGameLifecycle(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const context = await selectionContext(tx, game.campaignId, gameId);
    const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, gameId));
    const prep = states.find(s => s.phase === "preparation");
    const rows = await tx.select().from(gameStateValues).where(eq(gameStateValues.gameId, gameId)).orderBy(asc(gameStateValues.kpiDefinitionId));
    const snapshots = (["initial", "current"] as const).flatMap(phase => {
      const state = states.find(s => s.phase === phase);
      if (!state) return [];
      return [{ phase, values: context.definitions.map(d => {
        const row = rows.find(v => v.stateSetId === state.id && v.kpiDefinitionId === d.id);
        const value = !row ? "Sin configurar" : d.valueType === "ordinal" ? d.ordinalOptions.find(o => o.key === row.ordinalKey)?.label ?? "Nivel no disponible" : `${row.value} ${d.unit}`;
        return { id: d.id, name: d.name, value };
      }) }];
    });
    return { status: game.status, canStart: canStartGame(role, game.status) && !!prep && !prep.frozenAt && states.length === 1, revision: prep?.revision ?? 0, catalogToken: context.catalogToken, snapshots };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
