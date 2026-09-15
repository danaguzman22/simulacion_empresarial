import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameKpiChanges, gameStateSets, gameStateValues, rounds } from "@/db/schema";
import { access, hash, selectionContext } from "@/features/preparation/repositories/preparation.repository";
import { canWritePreparation, normalizeValue } from "@/features/preparation/domain/preparation";

export class GameKpiError extends Error {}

export type GameKpiControl = {
  id: string;
  key: string;
  name: string;
  unit: string;
  precision: number;
  allowsNegative: boolean;
  valueType: "numeric" | "ordinal";
  ordinalOptions: Array<{ key: string; label: string; position: number }>;
  value: string | null;
  displayValue: string;
};

export type GameKpiControls = {
  gameStatus: string;
  revision: number;
  activeRoundId: string | null;
  activeRoundRevision: number | null;
  canEdit: boolean;
  hasActiveRound: boolean;
  allCompleted: boolean;
  kpis: GameKpiControl[];
};

function displayValue(definition: Pick<GameKpiControl, "valueType" | "ordinalOptions">, value: string | null) {
  if (value === null) return "Sin configurar";
  if (definition.valueType === "ordinal") {
    return definition.ordinalOptions.find((option) => option.key === value)?.label ?? value;
  }
  return value;
}

export async function readGameKpiControls(gameId: string, actorId: string): Promise<GameKpiControls> {
  return db.transaction(async (tx) => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const context = await selectionContext(tx, game.campaignId, game.id);
    const [current] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, game.id), eq(gameStateSets.phase, "current")));
    const periodRows = await tx.select({ id: rounds.id, status: rounds.status, revision: rounds.revision }).from(rounds).where(eq(rounds.gameId, game.id)).orderBy(asc(rounds.sequence));
    const activeRound = periodRows.find((round) => round.status === "active" || round.status === "paused") ?? null;
    const allCompleted = periodRows.length > 0 && periodRows.every((round) => round.status === "completed");
    const values = current ? await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, current.id)) : [];
    const kpis = context.definitions.map((definition) => {
      const row = values.find((value) => value.kpiDefinitionId === definition.id);
      const value = row?.value?.toString() ?? row?.ordinalKey ?? null;
      return {
        id: definition.id,
        key: definition.key,
        name: definition.name,
        unit: definition.unit,
        precision: definition.precision,
        allowsNegative: definition.allowsNegative,
        valueType: definition.valueType,
        ordinalOptions: definition.ordinalOptions,
        value,
        displayValue: displayValue({ ...definition, valueType: definition.valueType, ordinalOptions: definition.ordinalOptions }, value),
      };
    });
    return {
      gameStatus: game.status,
      revision: current?.revision ?? 0,
      activeRoundId: activeRound?.id ?? null,
      activeRoundRevision: activeRound?.revision ?? null,
      canEdit: canWritePreparation(role) && game.status === "active" && !!activeRound && !allCompleted,
      hasActiveRound: !!activeRound,
      allCompleted,
      kpis,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type UpdateGameKpiInput = {
  gameId: string;
  operationId: string;
  kpiDefinitionId: string;
  roundId: string;
  expectedRevision: number;
  expectedRoundRevision: number;
  rawValue: string;
};

function auditValue(value: string | null, definition: { valueType: "numeric" | "ordinal"; ordinalOptions: Array<{ key: string; label: string }> }) {
  return {
    value: definition.valueType === "numeric" ? value : null,
    ordinalKey: definition.valueType === "ordinal" ? value : null,
    label: definition.valueType === "ordinal" ? definition.ordinalOptions.find((option) => option.key === value)?.label ?? value : value,
  };
}

export async function updateGameKpi(actorId: string, input: UpdateGameKpiInput) {
  const requestHash = hash({ actorId, ...input });
  return db.transaction(async (tx) => {
    const { game, role } = await access(tx, input.gameId, actorId, true);
    if (!canWritePreparation(role)) throw new GameKpiError("No tenés permiso para modificar los KPIs de la partida.");

    const [replay] = await tx.select().from(gameKpiChanges).where(eq(gameKpiChanges.operationId, input.operationId));
    if (replay) {
      if (replay.requestHash !== requestHash || replay.actorId !== actorId || replay.gameId !== game.id) {
        throw new GameKpiError("El identificador de operación ya fue utilizado con otros datos.");
      }
      return { replayed: true, revision: replay.revision };
    }

    if (game.status !== "active") throw new GameKpiError("La partida no está activa.");
    const [current] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, game.id), eq(gameStateSets.phase, "current"))).for("update");
    if (!current || current.frozenAt) throw new GameKpiError("El estado actual no está disponible para cambios.");
    if (current.revision !== input.expectedRevision) throw new GameKpiError("El estado actual cambió. Recargá los datos antes de guardar.");

    const [round] = await tx.select().from(rounds).where(and(eq(rounds.id, input.roundId), eq(rounds.gameId, game.id))).for("update");
    if (!round || (round.status !== "active" && round.status !== "paused")) throw new GameKpiError("Iniciá o pausá un período para registrar cambios operativos.");
    if (round.revision !== input.expectedRoundRevision) throw new GameKpiError("El período cambió. Recargá los datos antes de guardar.");

    const context = await selectionContext(tx, game.campaignId, game.id);
    const definition = context.definitions.find((candidate) => candidate.id === input.kpiDefinitionId);
    if (!definition) throw new GameKpiError("El KPI no pertenece a esta partida.");
    const normalized = normalizeValue(input.rawValue, definition);
    if (!normalized) throw new GameKpiError(`Ingresá un valor para ${definition.name}.`);

    const [row] = await tx.select().from(gameStateValues).where(and(eq(gameStateValues.stateSetId, current.id), eq(gameStateValues.kpiDefinitionId, definition.id))).for("update");
    const before = row.value?.toString() ?? row.ordinalKey;
    if (before === normalized) throw new GameKpiError("El valor no cambió.");
    const revision = current.revision + 1;
    const now = new Date();
    if (row) {
      await tx.update(gameStateValues).set({ value: definition.valueType === "numeric" ? normalized : null, ordinalKey: definition.valueType === "ordinal" ? normalized : null, updatedAt: now }).where(eq(gameStateValues.id, row.id));
    } else {
      await tx.insert(gameStateValues).values({ gameId: game.id, campaignId: game.campaignId, stateSetId: current.id, kpiDefinitionId: definition.id, value: definition.valueType === "numeric" ? normalized : null, ordinalKey: definition.valueType === "ordinal" ? normalized : null });
    }
    await tx.update(gameStateSets).set({ revision, updatedBy: actorId, updatedAt: now }).where(eq(gameStateSets.id, current.id));
    await tx.insert(gameKpiChanges).values({ operationId: input.operationId, gameId: game.id, campaignId: game.campaignId, stateSetId: current.id, roundId: round.id, kpiDefinitionId: definition.id, actorId, revision, requestHash, before: auditValue(before, definition), after: auditValue(normalized, definition) });
    return { replayed: false, revision, value: normalized, ordinalKey: definition.valueType === "ordinal" ? normalized : null };
  });
}
