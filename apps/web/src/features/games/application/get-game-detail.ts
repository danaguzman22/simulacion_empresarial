import "server-only";

import { cache } from "react";

import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { db } from "@/db";
import { readGameViewer } from "../repositories/game-viewer.repository";

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

  // Same rule as the dashboard and the participant's page (readGameViewer); the Master pages admit staff only.
  const access = await readGameViewer(db, gameId, userId);

  if (!access || access.viewer.kind !== "staff") {
    return { status: "not-found" } as const;
  }

  const { game } = access;

  return {
    status: "found",
    memberRole: access.viewer.role,
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
      companyId: game.companyId,
      companyName: game.companyName,
      // The company page is only for its owner (getMasterCompany); for anyone else the route shows it without a link.
      canOpenCompany: game.companyOwnerId === userId,
    },
  } as const;
});
