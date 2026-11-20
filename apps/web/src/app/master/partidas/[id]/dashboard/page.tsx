import { notFound } from "next/navigation";
import { requireGameTab } from "@/features/games/application/game-tab";
import { loadDashboard } from "@/features/dashboard/application/get-dashboard";
import { GameDashboard } from "@/features/dashboard/components/GameDashboard";

export const dynamic = "force-dynamic";

export default async function GameDashboardTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "dashboard");
  const data = await loadDashboard(game.id);
  if (!data) notFound();
  return <GameDashboard initial={data} mode="embedded" />;
}
