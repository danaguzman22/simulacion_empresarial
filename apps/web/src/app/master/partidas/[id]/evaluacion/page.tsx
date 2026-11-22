import { requireGameTab } from "@/features/games/application/game-tab";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { GameGoals } from "@/features/goals/components/GameGoals";

export const dynamic = "force-dynamic";

// Goal evaluation and the D-10 result first; the saved game states below as secondary information.
export default async function GameEvaluationTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "evaluacion");
  return <>
    <GameGoals gameId={game.id} />
    <GameLifecycle gameId={game.id} part="snapshots" />
  </>;
}
