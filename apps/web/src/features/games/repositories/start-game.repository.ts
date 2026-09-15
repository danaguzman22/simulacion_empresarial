import "server-only";
import { and, asc, desc, lt, eq, inArray, max, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, gameKpis, gameStateSets, gameStateValues, gamePreparationChanges, gameLifecycleChanges, rounds } from "@/db/schema";
import { access, selectionContext, hash } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { canStartGame, validateStartValues } from "../domain/start-game";

import { createConfiguredRounds } from "@/features/rounds/repositories/round.repository";

export type StartGameInput = { gameId: string; operationId: string; expectedRevision: number; catalogToken: string; expectedPeriodRevision: number };
export async function startGame(actorId: string, input: StartGameInput) {
  const requestHash = hash({ actorId, ...input });
  return db.transaction(async tx => {
    // Same campaign -> game -> preparation locking order as preparation writes.
    const { game, role } = await access(tx, input.gameId, actorId, true);
    const [previous] = await tx.select().from(gamePreparationChanges).where(eq(gamePreparationChanges.operationId, input.operationId));
    const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, game.id)).for("update");
    const prep = states.find(s => s.phase === "preparation");
    const existingInitial = states.find(s => s.phase === "initial");
    const existingCurrent = states.find(s => s.phase === "current");
    const restarting = !!existingInitial || !!existingCurrent;
    if (previous) {
      if (previous.operation !== "start_game" || previous.requestHash !== requestHash || previous.actorId !== actorId || previous.stateSetId !== prep?.id) {
        throw new PreparationError("La operación ya fue utilizada con otros datos.");
      }
      return { replayed: true };
    }
    if (!canStartGame(role, game.status)) throw new PreparationError("La partida ya comenzó o no puede iniciarse en su estado actual.");
    if (!prep || (!restarting && prep.frozenAt)) throw new PreparationError("Primero guardá una preparación editable.");
    if (restarting && (!existingInitial || !existingCurrent || !existingInitial.frozenAt || existingCurrent.frozenAt)) throw new PreparationError("La partida no tiene snapshots válidos para reiniciarse.");
    if (states.some(s => s.phase === "final" || !["preparation", "initial", "current"].includes(s.phase))) throw new PreparationError("La partida ya tiene estados históricos; no puede iniciarse de nuevo.");
    if (prep.revision !== input.expectedRevision) throw new PreparationError("Cambió la preparación. Recargá los datos antes de iniciar.");
    const context = await selectionContext(tx, game.campaignId, game.id);
    if (context.catalogToken !== input.catalogToken) throw new PreparationError("Cambió la selección o el catálogo. Recargá los datos antes de iniciar.");
    const [other] = await tx.select({ id: games.id }).from(games).where(and(eq(games.campaignId, game.campaignId), ne(games.id, game.id), inArray(games.status, ["active", "paused"])));
    if (other) throw new PreparationError("Ya hay otra partida activa o pausada en esta campaña.");
    if (!game.periodCount || !game.periodDurationSeconds || !game.periodLabel) throw new PreparationError("Primero configurá los períodos.");
    if (game.periodRevision !== input.expectedPeriodRevision) throw new PreparationError("Cambió la configuración de períodos. Recargá los datos.");
    if ((await tx.select({ id: rounds.id }).from(rounds).where(eq(rounds.gameId, game.id))).length) throw new PreparationError("La partida ya tiene períodos; revisá sus datos.");
    const [previousGame] = game.sequence > 0
      ? await tx.select().from(games).where(and(eq(games.campaignId, game.campaignId), lt(games.sequence, game.sequence))).orderBy(desc(games.sequence)).limit(1).for("share")
      : [];
    let sourceStateSetId = prep.sourceStateSetId;
    let values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, prep.id));
    if (previousGame && !restarting) {
      if (previousGame.status !== "completed") throw new PreparationError("La partida anterior debe finalizarse antes de iniciar esta partida.");
      const [previousFinal] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, previousGame.id), eq(gameStateSets.phase, "final")));
      if (!previousFinal || !previousFinal.frozenAt) throw new PreparationError("La partida anterior no tiene un snapshot final válido.");
      const previousKpis = await tx.select({ id: gameKpis.kpiDefinitionId }).from(gameKpis).where(eq(gameKpis.gameId, previousGame.id));
      const currentKpis = await tx.select({ id: gameKpis.kpiDefinitionId }).from(gameKpis).where(eq(gameKpis.gameId, game.id));
      if (previousKpis.some((row) => !currentKpis.some((currentRow) => currentRow.id === row.id))) throw new PreparationError("La estructura de KPIs no coincide con la partida anterior.");
      sourceStateSetId = previousFinal.id;
      const inheritedValues = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, previousFinal.id));
      if (prep.sourceStateSetId !== previousFinal.id || inheritedValues.some(v => !values.some(w => w.kpiDefinitionId === v.kpiDefinitionId && w.value === v.value && w.ordinalKey === v.ordinalKey))) throw new PreparationError("La preparación no conserva los valores del final de origen.");
      await tx.insert(gameLifecycleChanges).values({ operationId: input.operationId, gameId: game.id, campaignId: game.campaignId, actorId, operation: "create_from_previous", details: { previousGameId: previousGame.id, sourceStateSetId: previousFinal.id } });
    }
    if (previousGame && restarting && previousGame.status !== "completed") throw new PreparationError("La partida anterior debe finalizarse antes de iniciar esta partida.");
    if (restarting) values = await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, existingInitial!.id));
    validateStartValues(context.definitions, values);
    const now = new Date();
    if (restarting) await tx.execute(sql`set local nexus.lifecycle_operation = 'restart'`);
    const ids: Partial<Record<"initial" | "current", string>> = {};
    for (const phase of ["initial", "current"] as const) {
      const existing = states.find((state) => state.phase === phase);
      if (existing) {
        ids[phase] = existing.id;
        continue;
      }
      const [created] = await tx.insert(gameStateSets).values({ gameId: game.id, campaignId: game.campaignId, phase, sourceStateSetId, createdBy: actorId, updatedBy: actorId }).returning({ id: gameStateSets.id });
      ids[phase] = created.id;
      if (values.length) await tx.insert(gameStateValues).values(values.map(v => ({ gameId: game.id, campaignId: game.campaignId, stateSetId: created.id, kpiDefinitionId: v.kpiDefinitionId, value: v.value, ordinalKey: v.ordinalKey })));
      if (phase === "initial") await tx.update(gameStateSets).set({ frozenAt: now }).where(eq(gameStateSets.id, created.id));
    }
    await createConfiguredRounds(tx, game, actorId, input.operationId);
    const revision = prep.revision + 1;
    await tx.update(gameStateSets).set({ frozenAt: prep.frozenAt ?? now, revision, updatedBy: actorId, updatedAt: now }).where(eq(gameStateSets.id, prep.id));
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
    const snapshots = (["initial", "current", "final"] as const).flatMap(phase => {
      const state = states.find(s => s.phase === phase);
      if (!state) return [];
      return [{ phase, values: context.definitions.map(d => {
        const row = rows.find(v => v.stateSetId === state.id && v.kpiDefinitionId === d.id);
        const value = !row ? "Sin configurar" : d.valueType === "ordinal" ? d.ordinalOptions.find(o => o.key === row.ordinalKey)?.label ?? "Nivel no disponible" : `${row.value} ${d.unit}`;
        return { id: d.id, name: d.name, value };
      }) }];
    });
    const [last] = await tx.select({ sequence: max(games.sequence) }).from(games).where(eq(games.campaignId, game.campaignId));
    const hasSnapshots = states.some((state) => state.phase === "initial") && states.some((state) => state.phase === "current");
    const preparationReady = hasSnapshots ? !!prep?.frozenAt : !!prep && !prep.frozenAt;
    const periodRows = await tx.select({ status: rounds.status }).from(rounds).where(eq(rounds.gameId, gameId));
    const isMaster = role === "master";
    return { canFinish: ["master", "co_master"].includes(role) && game.status === "evaluation" && periodRows.length > 0 && periodRows.every(r => r.status === "completed") && states.some(s => s.phase === "current" && !s.frozenAt) && !states.some(s => s.phase === "final"), canManageLifecycle: isMaster, hasResetSnapshots: hasSnapshots, status: game.status, periodRevision: game.periodRevision, isLast: last?.sequence === game.sequence, canStart: !!game.periodCount && !!game.periodDurationSeconds && canStartGame(role, game.status) && preparationReady && states.every((state) => ["preparation", "initial", "current"].includes(state.phase)), revision: prep?.revision ?? 0, catalogToken: context.catalogToken, snapshots };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
