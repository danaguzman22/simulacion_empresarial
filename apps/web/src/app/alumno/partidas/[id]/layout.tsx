import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { loadDashboard } from "@/features/dashboard/application/get-dashboard";
import { gameStatusLabels } from "@/features/games/domain/game";
import { StudentGameTabs } from "@/features/students/components/StudentGameTabs";

export const dynamic = "force-dynamic";

// Participant's game page (#32): Mi ficha and Dashboard tabs. Only a participant with a card in this game,
// once it started, gets in; staff use their own pages.
export default async function StudentGameLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await getAuthenticatedUserId()) redirect("/login/alumno");
  const data = await loadDashboard(id);
  if (!data || data.viewer !== "participant") notFound();
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-6xl">
    <Link href="/alumno" className="text-sky-300">Volver a mis partidas</Link>
    <p className="mt-6 text-slate-400">{data.game.name} · {gameStatusLabels[data.game.status]}</p>
    <StudentGameTabs gameId={data.game.id} />
    {children}
  </div></main>;
}
