import { getGameLifecycle } from "../application/get-game-lifecycle";
import { StartGameForm } from "./StartGameForm";
export async function GameLifecycle({ gameId }: { gameId: string }) {
  const data = await getGameLifecycle(gameId);
  if (!data) return null;
  return <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8" aria-label="Estado de la partida">
    {data.status === "active" && <h2 className="text-2xl font-black text-emerald-300">Partida activa</h2>}
    {data.canStart && <><h2 className="text-2xl font-black">Iniciar partida</h2><StartGameForm key={`${data.revision}:${data.catalogToken}`} gameId={gameId} revision={data.revision} catalogToken={data.catalogToken} /></>}
    {(data.status === "draft" || data.status === "ready") && !data.snapshots.length && !data.canStart && <p className="text-sm text-slate-400">El inicio requiere una preparación guardada y permisos de Master o Co-Master.</p>}
    <div className="mt-5 grid gap-5 md:grid-cols-2">{data.snapshots.map(snapshot => <article key={snapshot.phase} className="rounded-2xl border border-white/10 p-5">
      <h3 className="text-xl font-bold">{snapshot.phase === "initial" ? "Estado inicial" : "Estado actual"}</h3>
      <p className="mt-2 text-sm text-slate-400">{snapshot.phase === "initial" ? "Snapshot congelado al iniciar." : "Copia independiente preparada para cambios futuros."}</p>
      <dl className="mt-4 space-y-3">{snapshot.values.map(v => <div key={v.id}><dt className="font-bold">{v.name}</dt><dd className="text-slate-300">{v.value}</dd></div>)}</dl>
      {!snapshot.values.length && <p className="mt-4 text-slate-400">Sin KPIs seleccionados.</p>}
    </article>)}</div>
  </section>;
}
