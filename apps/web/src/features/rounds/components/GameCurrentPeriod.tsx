import { getRounds } from "../application/round-actions";
import { CurrentPeriodBar } from "./CurrentPeriodBar";
export async function GameCurrentPeriod({ gameId }: { gameId: string }) {
  const initial = await getRounds(gameId);
  // Keyed by the server time: after an action revalidates the layout, the bar restarts from the fresh data.
  return <CurrentPeriodBar key={initial.serverNow} gameId={gameId} initial={initial} />;
}
