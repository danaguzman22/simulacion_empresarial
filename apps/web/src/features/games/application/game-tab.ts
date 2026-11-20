import "server-only";
import { notFound, redirect } from "next/navigation";
import { defaultGameTab, gameTabsFor, type GameTab } from "../domain/game-tabs";
import { getGameDetail } from "./get-game-detail";

// Every tab page calls this: same access check as the layout (cached), and a tab that does not
// exist for the current status sends the user to the right one.
export async function requireGameTab(gameId: string, tab: GameTab) {
  const result = await getGameDetail(gameId);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  if (!gameTabsFor(result.game.status).includes(tab)) redirect(`/master/partidas/${gameId}/${defaultGameTab(result.game.status)}`);
  return result.game;
}
