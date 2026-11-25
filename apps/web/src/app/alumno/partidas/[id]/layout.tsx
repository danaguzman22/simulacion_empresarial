import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { loadDashboard } from "@/features/dashboard/application/get-dashboard";
import { gameStatusLabels } from "@/features/games/domain/game";
import { StudentGameTabs } from "@/features/students/components/StudentGameTabs";
import { PendingGameNotice } from "@/features/students/components/PendingGameNotice";
import { readPendingAssignedGame } from "@/features/students/repositories/student.repository";
import { isUuid } from "@/features/students/domain/assignment";

export const dynamic = "force-dynamic";

// Participant's game page (#32): Mi ficha and Dashboard tabs. Only a participant with a card in this game,
// once it started, gets in; staff go to the Panel. Before Start, the participant sees "todavía no empezó".
export default async function StudentGameLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/alumno");
  const data = await loadDashboard(id);
  // Staff of the campaign see the game in the Panel (D-48: they are not members of its games).
  if (data && data.viewer !== "participant") redirect(`/master/partidas/${id}`);
  if (!data) {
    // Before Start, a person with a card here gets the same message as in "Mis partidas", not a 404.
    const pending = isUuid(id) ? await readPendingAssignedGame(id, actor) : null;
    if (!pending) notFound();
    return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-6xl">
      <Link href="/alumno" className="text-sky-300">Volver a mis partidas</Link>
      <section className="mt-6 rounded-3xl border border-white/10 p-6"><h1 className="text-xl font-bold">{pending.name}</h1><PendingGameNotice periods={pending} /></section>
    </div></main>;
  }
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-6xl">
    <Link href="/alumno" className="text-sky-300">Volver a mis partidas</Link>
    <p className="mt-6 text-slate-400">{data.game.name} · {gameStatusLabels[data.game.status]}</p>
    <StudentGameTabs gameId={data.game.id} />
    {children}
  </div></main>;
}
