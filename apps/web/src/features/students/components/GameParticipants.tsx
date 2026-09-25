import { getGameParticipants } from "../application/get-game-participants";
import { ParticipantForm } from "./ParticipantForm";
export async function GameParticipants({ gameId }: { gameId: string }) {
  const data = await getGameParticipants(gameId);
  if (!data) return null;
  return <section className="mt-6 rounded-3xl border border-white/10 p-6"><h2 className="text-xl font-bold">Integrantes por departamento</h2>
    {data.legacy && <p className="mt-3 text-amber-300">Empresa pendiente de vinculación institucional. Se conservan los integrantes actuales; no se permiten nuevas asignaciones ni cambios de departamento.</p>}
    {!data.departments.length && <p className="mt-3 text-slate-400">Agregá fichas a la partida para asignar integrantes.</p>}
    {data.departments.map(d => <article key={d.id} className="mt-4 rounded-xl bg-white/5 p-4"><h3 className="font-bold">{d.department} — {d.name}</h3>
      {!data.members.some(m => m.cardId === d.id) && <p className="text-slate-400">Sin integrantes.</p>}
      {data.members.filter(m => m.cardId === d.id).map(m => <div key={m.id} className="mt-3"><p>{m.name}</p>{data.canManage && <ParticipantForm key={`${m.id}-${m.revision}`} gameId={gameId} departments={data.departments} canAssign={!data.legacy} member={m} />}</div>)}
    </article>)}
    {data.canManage && !data.legacy && data.departments.length > 0 && <ParticipantForm gameId={gameId} departments={data.departments} />}
  </section>;
}
