import { notFound } from "next/navigation";
import { loadDashboard } from "@/features/dashboard/application/get-dashboard";
import { GameDashboard } from "@/features/dashboard/components/GameDashboard";

export const dynamic = "force-dynamic";

export default async function StudentDashboardTab({ params }: { params: Promise<{ id: string }> }) {
  const data = await loadDashboard((await params).id);
  if (!data || data.viewer !== "participant") notFound();
  return <GameDashboard initial={data} mode="embedded" />;
}
