import { getGameKpiControls } from "../application/game-kpi-actions";
import { GameKpiControlsPanel } from "./GameKpiControlsPanel";

export async function GameKpiControls({ gameId }: { gameId: string }) {
  const data = await getGameKpiControls(gameId);
  if (!data) return null;
  return <GameKpiControlsPanel key={`${data.revision}:${data.activeRoundId}:${data.activeRoundRevision}`} gameId={gameId} data={data} />;
}
