import "server-only";

import { randomUUID } from "node:crypto";
import { createSuccessorGame } from "./create-successor.repository";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignMembers, games } from "@/db/schema";
import { canCreateGame } from "../domain/game-access";
import { nextGameSequence, type GameType } from "../domain/game";

type CreateGameInput = {
  campaignId: string;
  profileId: string;
  name: string;
  description: string | null;
  type: GameType;
};

export async function createGame(input: CreateGameInput) {
  return db.transaction(async (tx) => {
    // Lock the parent even when there are no games yet.
    const [campaign] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .for("update");

    if (!campaign) {
      return { status: "not-found" } as const;
    }

    const [member] = await tx
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaign.id),
        eq(campaignMembers.profileId, input.profileId)
      ))
      .for("share");

    if (!member || !canCreateGame(member.role)) {
      return { status: "forbidden" } as const;
    }

    const [last] = await tx.select().from(games).where(eq(games.campaignId, campaign.id)).orderBy(desc(games.sequence)).limit(1).for("update");
    if (last) {
      const game = await createSuccessorGame(tx, input.profileId, last, { name: input.name.trim(), description: input.description?.trim() || null, type: input.type, operationId: randomUUID() });
      return { status: "created", game } as const;
    }
    const [game] = await tx
      .insert(games)
      .values({
        campaignId: campaign.id,
        sequence: nextGameSequence(null),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type,
      })
      .returning({ id: games.id });

    if (!game) {
      throw new Error("No se pudo obtener la partida creada.");
    }

    return { status: "created", game } as const;
  }, { isolationLevel: "read committed" });
}

export async function findGamesByCampaign(campaignId: string) {
  return db
    .select({
      id: games.id,
      sequence: games.sequence,
      name: games.name,
      description: games.description,
      type: games.type,
      status: games.status,
    })
    .from(games)
    .where(eq(games.campaignId, campaignId))
    .orderBy(asc(games.sequence));
}

export async function findGameByIdForMember(gameId: string, profileId: string) {
  const [game] = await db
    .select({
      id: games.id,
      sequence: games.sequence,
      name: games.name,
      description: games.description,
      type: games.type,
      status: games.status,
      createdAt: games.createdAt,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      memberRole: campaignMembers.role,
    })
    .from(games)
    .innerJoin(campaigns, eq(campaigns.id, games.campaignId))
    .innerJoin(
      campaignMembers,
      and(
        eq(campaignMembers.campaignId, games.campaignId),
        eq(campaignMembers.profileId, profileId)
      )
    )
    .where(eq(games.id, gameId))
    .limit(1);

  return game ?? null;
}
