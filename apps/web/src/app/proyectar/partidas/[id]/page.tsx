import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { loadDashboard } from "@/features/dashboard/application/get-dashboard";
import { GameDashboard } from "@/features/dashboard/components/GameDashboard";
import { canProjectDashboard } from "@/features/dashboard/domain/dashboard";

export const dynamic = "force-dynamic";

// Projection window (#32): full screen, read only, refreshes itself. Only campaign staff (Master, Co-Master,
// Observer) can open it; participants see the dashboard in their own tab.
export default async function ProjectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await getAuthenticatedUserId()) redirect("/login/master");
  const data = await loadDashboard(id);
  if (!data || !canProjectDashboard(data.viewer)) notFound();
  return <main className="min-h-screen bg-slate-200"><GameDashboard initial={data} mode="projection" /></main>;
}
