import { requireGameTab } from "@/features/games/application/game-tab";
import { GameRecords } from "@/features/records/components/GameRecords";

export const dynamic = "force-dynamic";

export default async function GameRecordsTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "registros");
  return <GameRecords gameId={game.id} />;
}
