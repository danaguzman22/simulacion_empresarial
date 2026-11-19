import { getGameLifecycle } from "../application/get-game-lifecycle";
import { getGameSetup } from "../application/get-game-setup";
import { StartGameForm } from "./StartGameForm";
// Enabled only when the server-side checks pass; otherwise it lists what is missing.
// The start action itself re-validates everything on the server.
export async function GameStartButton({ gameId }: { gameId: string }) {
  const [lifecycle, setup] = [await getGameLifecycle(gameId), await getGameSetup(gameId)];
  if (!lifecycle || !setup) return null;
  const missing = setup.missing.length ? setup.missing : lifecycle.canStart ? [] : ["La preparación ya no se puede iniciar en su estado actual. Recargá los datos."];
  if (missing.length) return <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <button type="button" disabled className="rounded-xl bg-slate-700 px-5 py-3 font-bold text-slate-300 opacity-70">Iniciar partida</button>
    <p className="mt-3 text-sm font-bold text-slate-300">Falta para iniciar:</p>
    <ul className="mt-1 list-inside list-disc text-sm text-slate-400">{missing.map(item => <li key={item}>{item}</li>)}</ul>
  </div>;
  return <details className="mt-4 rounded-2xl border border-sky-300/40 bg-sky-300/10 p-4">
    <summary className="inline-block cursor-pointer rounded-xl bg-sky-300 px-5 py-3 font-bold text-slate-950">Iniciar partida</summary>
    <StartGameForm key={`${lifecycle.revision}:${lifecycle.catalogToken}:${lifecycle.periodRevision}`} gameId={gameId} periodRevision={lifecycle.periodRevision} revision={lifecycle.revision} catalogToken={lifecycle.catalogToken} />
  </details>;
}
