import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gameKpiChanges, gameLifecycleChanges, gamePreparationChanges, gameRuleChanges, gameRuleExecutions, gameRules, gameSituations, gameStateSets, kpiDefinitions, profiles, roundChanges, rounds } from "@/db/schema";
import { access } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import type { RecordsSource } from "../domain/record";

/** A consistent, read-only snapshot. Never invokes polling/lazy close repositories. */
export async function readRecordsSource(gameId: string, actorId: string): Promise<RecordsSource> {
  if (!UUID_PATTERN.test(gameId)) throw new PreparationError("Partida no disponible.");
  return db.transaction(async tx => {
    const { game } = await access(tx, gameId, actorId, false);
    const campaignId = game.campaignId;
    // Fixed query count: effects and actor/catalogue metadata are fetched in batches.
    const [periods, changes, situations, executions, ruleChanges, roundAudit, starts, lifecycle, ruleNames] = await Promise.all([
      tx.select({ id: rounds.id, sequence: rounds.sequence, status: rounds.status }).from(rounds).where(and(eq(rounds.gameId, gameId), eq(rounds.campaignId, campaignId))),
      tx.select({ id: gameKpiChanges.id, actorId: gameKpiChanges.actorId, createdAt: gameKpiChanges.createdAt, source: gameKpiChanges.source, roundId: gameKpiChanges.roundId, kpiDefinitionId: gameKpiChanges.kpiDefinitionId, situationId: gameKpiChanges.situationId, ruleExecutionId: gameKpiChanges.ruleExecutionId, before: gameKpiChanges.before, after: gameKpiChanges.after, amount: gameKpiChanges.amount }).from(gameKpiChanges).where(and(eq(gameKpiChanges.gameId, gameId), eq(gameKpiChanges.campaignId, campaignId))),
      tx.select({ id: gameSituations.id, actorId: gameSituations.actorId, roundId: gameSituations.roundId, title: gameSituations.title, description: gameSituations.description, publishedAt: gameSituations.publishedAt }).from(gameSituations).where(and(eq(gameSituations.gameId, gameId), eq(gameSituations.campaignId, campaignId))),
      tx.select({ id: gameRuleExecutions.id, ruleId: gameRuleExecutions.ruleId, roundId: gameRuleExecutions.roundId, reason: gameRuleExecutions.reason, executedAt: gameRuleExecutions.executedAt }).from(gameRuleExecutions).where(and(eq(gameRuleExecutions.gameId, gameId), eq(gameRuleExecutions.campaignId, campaignId))),
      tx.select({ id: gameRuleChanges.id, ruleId: gameRuleChanges.ruleId, kpiDefinitionId: gameRuleChanges.kpiDefinitionId, revision: gameRuleChanges.revision, actorId: gameRuleChanges.actorId, createdAt: gameRuleChanges.createdAt, reason: gameRuleChanges.reason, beforeAmount: gameRuleChanges.beforeAmount, afterAmount: gameRuleChanges.afterAmount, discardedByResetId: gameRuleChanges.discardedByResetId }).from(gameRuleChanges).where(and(eq(gameRuleChanges.gameId, gameId), eq(gameRuleChanges.campaignId, campaignId))),
      tx.select({ id: roundChanges.id, actorId: roundChanges.actorId, createdAt: roundChanges.createdAt, roundId: roundChanges.roundId, operation: roundChanges.operation, details: roundChanges.details }).from(roundChanges).where(and(eq(roundChanges.gameId, gameId), eq(roundChanges.campaignId, campaignId))),
      tx.select({ id: gamePreparationChanges.id, actorId: gamePreparationChanges.actorId, createdAt: gamePreparationChanges.createdAt, details: gamePreparationChanges.details }).from(gamePreparationChanges)
        .innerJoin(gameStateSets, and(eq(gameStateSets.id, gamePreparationChanges.stateSetId), eq(gameStateSets.campaignId, campaignId)))
        .where(and(eq(gameStateSets.gameId, gameId), eq(gamePreparationChanges.campaignId, campaignId), eq(gamePreparationChanges.operation, "start_game"))),
      tx.select({ id: gameLifecycleChanges.id, actorId: gameLifecycleChanges.actorId, createdAt: gameLifecycleChanges.createdAt, operationId: gameLifecycleChanges.operationId, operation: gameLifecycleChanges.operation, details: gameLifecycleChanges.details }).from(gameLifecycleChanges).where(and(eq(gameLifecycleChanges.gameId, gameId), eq(gameLifecycleChanges.campaignId, campaignId))),
      tx.select({ id: gameRules.id, name: gameRules.name }).from(gameRules).where(and(eq(gameRules.gameId, gameId), eq(gameRules.campaignId, campaignId))),
    ]);
    const actorIds = [...new Set([...changes, ...situations, ...ruleChanges, ...roundAudit, ...starts, ...lifecycle].map(row => row.actorId).filter((id): id is string => id !== null))];
    const definitionIds = [...new Set([...changes, ...ruleChanges].map(row => row.kpiDefinitionId))];
    const [actors, definitions] = await Promise.all([
      actorIds.length ? tx.select({ id: profiles.id, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.id, actorIds)) : [],
      definitionIds.length ? tx.select({ id: kpiDefinitions.id, name: kpiDefinitions.name, unit: kpiDefinitions.unit }).from(kpiDefinitions).where(and(eq(kpiDefinitions.campaignId, campaignId), inArray(kpiDefinitions.id, definitionIds))) : [],
    ]);
    return { periodLabel: game.periodLabel ?? "Período", status: game.status, periods, actors, definitions, rules: ruleNames, changes, situations, executions, ruleChanges, roundChanges: roundAudit, starts, lifecycle };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
