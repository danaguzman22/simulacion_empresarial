import "server-only";

import { cache } from "react";

import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { canReadGames } from "../domain/game-access";
import { findGameByIdForMember } from "../repositories/game.repository";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cached per request: the game layout and the open tab read the same game without repeating the query.
export const getGameDetail = cache(async (gameId: string) => {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return { status: "unauthenticated" } as const;
  }

  if (!uuidPattern.test(gameId)) {
    return { status: "not-found" } as const;
  }

  const game = await findGameByIdForMember(gameId, userId);

  if (!game || !canReadGames(game.memberRole)) {
    return { status: "not-found" } as const;
  }

  return {
    status: "found",
    memberRole: game.memberRole,
    game: {
      id: game.id,
      sequence: game.sequence,
      name: game.name,
      description: game.description,
      type: game.type,
      status: game.status,
      createdAt: game.createdAt,
      campaignId: game.campaignId,
      campaignName: game.campaignName,
    },
  } as const;
});
