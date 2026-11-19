import { requireGameTab } from "@/features/games/application/game-tab";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";

export const dynamic = "force-dynamic";

export default async function GameEvaluationTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "evaluacion");
  return <GameLifecycle gameId={game.id} part="snapshots" />;
}
