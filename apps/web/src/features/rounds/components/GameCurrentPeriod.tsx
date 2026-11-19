import { getRounds } from "../application/round-actions";
import { CurrentPeriodBar } from "./CurrentPeriodBar";
export async function GameCurrentPeriod({ gameId }: { gameId: string }) {
  return <CurrentPeriodBar gameId={gameId} initial={await getRounds(gameId)} />;
}
