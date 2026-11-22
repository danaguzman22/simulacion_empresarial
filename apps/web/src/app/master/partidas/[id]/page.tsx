import { notFound, redirect } from "next/navigation";
import { getGameDetail } from "@/features/games/application/get-game-detail";
import { defaultGameTab } from "@/features/games/domain/game-tabs";

export const dynamic = "force-dynamic";

// The game has no page of its own: it opens the tab that matches its status.
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getGameDetail(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  redirect(`/master/partidas/${id}/${defaultGameTab(result.game.status)}`);
}
