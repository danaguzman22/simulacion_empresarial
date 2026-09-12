import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { notFound, redirect } from "next/navigation";
import { getGamePreparation } from "@/features/preparation/application/get-game-preparation";
import { InitialConfiguration } from "@/features/preparation/components/InitialConfiguration";
import { GameDetail } from "@/features/games/components/GameDetail";

export const dynamic = "force-dynamic";

type GamePageProps = {
  params: Promise<{ id: string }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params;
  const result = await getGamePreparation(id);

  if (result.status === "unauthenticated") {
    redirect("/login/master");
  }

  if (result.status === "not-found") {
    notFound();
  }

  return (
    <GameDetail game={result.game}>
      <InitialConfiguration gameId={result.game.id} data={result.preparation} />
      <GameLifecycle gameId={result.game.id} />
    </GameDetail>
  );
}
