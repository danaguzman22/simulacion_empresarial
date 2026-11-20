import { notFound, redirect } from "next/navigation";
import { requireGameTab } from "@/features/games/application/game-tab";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { getGamePreparation } from "@/features/preparation/application/get-game-preparation";
import { InitialConfiguration } from "@/features/preparation/components/InitialConfiguration";

export const dynamic = "force-dynamic";

export default async function GameKpisTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "kpis");
  const result = await getGamePreparation(game.id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  return <>
    <InitialConfiguration gameId={game.id} data={result.preparation} />
    <GameLifecycle gameId={game.id} part="snapshots" />
  </>;
}
