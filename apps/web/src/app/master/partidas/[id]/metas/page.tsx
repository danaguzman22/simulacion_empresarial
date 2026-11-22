import { requireGameTab } from "@/features/games/application/game-tab";
import { SectionRequirement } from "@/features/games/components/SectionRequirement";
import { GameGoals } from "@/features/goals/components/GameGoals";

export const dynamic = "force-dynamic";

export default async function GameGoalsTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "metas");
  return <>
    <SectionRequirement gameId={game.id} section="goals" />
    <GameGoals gameId={game.id} />
  </>;
}
