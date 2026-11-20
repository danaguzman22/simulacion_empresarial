import { requireGameTab } from "@/features/games/application/game-tab";
import { GamePeriodConfiguration } from "@/features/rounds/components/GamePeriodConfiguration";

export const dynamic = "force-dynamic";

export default async function GameTimesTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "tiempos");
  return <GamePeriodConfiguration gameId={game.id} />;
}
