import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games, gameStateSets, gamePreparationChanges } from "@/db/schema";
import { access, hash, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import type { RequirementSection } from "../domain/section-requirement";

export type SectionRequirementInput = { gameId: string; operationId: string; section: RequirementSection; required: boolean; expectedRevision: number };

async function preparationState(tx: Transaction, gameId: string, campaignId: string, actorId: string) {
  const [existing] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, gameId), eq(gameStateSets.phase, "preparation"))).for("update");
  if (existing) return existing;
  const [created] = await tx.insert(gameStateSets).values({ gameId, campaignId, phase: "preparation", createdBy: actorId, updatedBy: actorId }).returning();
  return created;
}

// D-33: same path as the KPI "required" switch. Master or Co-Master (access write), preparation only, stale-revision
// check, and the preparation audit row in the same transaction. The database checks all of it again (0033).
export async function setSectionRequired(actorId: string, input: SectionRequirementInput) {
  const requestHash = hash({ actorId, ...input });
  return db.transaction(async tx => {
    const { game } = await access(tx, input.gameId, actorId, true);
    const [replay] = await tx.select().from(gamePreparationChanges).where(eq(gamePreparationChanges.operationId, input.operationId));
    if (replay) {
      if (replay.actorId !== actorId || replay.requestHash !== requestHash) throw new PreparationError("La operación ya se usó con otros datos.");
      return { replayed: true };
    }
    const [current] = await tx.select().from(games).where(eq(games.id, game.id)).for("update");
    if (!current || !["draft", "ready"].includes(current.status)) throw new PreparationError("Solo se puede cambiar mientras la partida está en preparación.");
    const state = await preparationState(tx, game.id, game.campaignId, actorId);
    if (state.frozenAt) throw new PreparationError("Solo se puede cambiar mientras la partida está en preparación.");
    if (state.revision !== input.expectedRevision) throw new PreparationError("Cambió la preparación. Recargá los datos antes de continuar.");
    const next = {
      goalsRequired: input.section === "goals" ? input.required : current.goalsRequired,
      rulesRequired: input.section === "rules" ? input.required : current.rulesRequired,
    };
    if (next.goalsRequired === current.goalsRequired && next.rulesRequired === current.rulesRequired) return { replayed: false };
    const revision = state.revision + 1;
    await tx.update(gameStateSets).set({ revision, updatedBy: actorId, updatedAt: new Date() }).where(eq(gameStateSets.id, state.id));
    await tx.insert(gamePreparationChanges).values({
      operationId: input.operationId, campaignId: game.campaignId, stateSetId: state.id, actorId, operation: "set_section_required", requestHash,
      previousRevision: state.revision, revision,
      details: { section: input.section, before: { goalsRequired: current.goalsRequired, rulesRequired: current.rulesRequired }, ...next },
    });
    await tx.update(games).set(next).where(eq(games.id, game.id));
    return { replayed: false };
  });
}
