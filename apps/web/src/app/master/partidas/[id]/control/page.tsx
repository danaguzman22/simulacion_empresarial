import { requireGameTab } from "@/features/games/application/game-tab";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { GameRounds } from "@/features/rounds/components/GameRounds";
import { GameKpiControls } from "@/features/kpis/components/GameKpiControls";
import { GameSituations } from "@/features/situations/components/GameSituations";

export const dynamic = "force-dynamic";

export default async function GameControlTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "control");
  // Same visibility conditions as the former single page.
  const running = game.status === "active" || game.status === "evaluation";
  return <>
    {running && <GameRounds gameId={game.id} />}
    {running && <GameKpiControls gameId={game.id} />}
    <GameSituations gameId={game.id} />
    <GameLifecycle gameId={game.id} part="snapshots" />
  </>;
}
