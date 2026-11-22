import { requireGameTab } from "@/features/games/application/game-tab";
import { GameParticipants } from "@/features/students/components/GameParticipants";

export const dynamic = "force-dynamic";

export default async function GameTeamsTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "equipos");
  return <GameParticipants gameId={game.id} />;
}
