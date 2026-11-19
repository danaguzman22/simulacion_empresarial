import { requireGameTab } from "@/features/games/application/game-tab";

export const dynamic = "force-dynamic";

export default async function GameDashboardTab({ params }: { params: Promise<{ id: string }> }) {
  await requireGameTab((await params).id, "dashboard");
  return <section aria-labelledby="dashboard-title" className="mt-8 rounded-3xl border border-dashed border-white/15 p-8">
    <h2 id="dashboard-title" className="text-2xl font-black">Dashboard de la partida</h2>
    <p className="mt-3 text-slate-400">Acá se va a ver la partida en vivo: KPIs, metas, reloj y avisos. Próximamente.</p>
  </section>;
}
