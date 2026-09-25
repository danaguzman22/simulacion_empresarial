"use client";
import { useActionState } from "react";
import { saveAssignment } from "../application/assignment-actions";
export function ParticipantForm({ gameId, departments, member, canAssign = true }: { gameId: string; canAssign?: boolean; departments: { id: string; name: string; department: string }[]; member?: { id: string; cardId: string; revision: number } }) {
  const [state, action, pending] = useActionState(saveAssignment, { message: "" });
  return <form action={action} className="mt-3 flex flex-wrap items-end gap-3 text-sm" onSubmit={e => { if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "remove" && !window.confirm("¿Quitar al integrante de esta partida?")) e.preventDefault(); }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="assignmentId" value={member?.id ?? ""} />
    <input type="hidden" name="revision" value={member?.revision ?? 0} />
    {!member && <label>Correo registrado<input className="block rounded bg-slate-900 p-2" type="email" name="email" required maxLength={254} /></label>}
    {canAssign && <label>Departamento<select name="cardId" defaultValue={member?.cardId} className="block rounded bg-slate-900 p-2">{departments.map(d => <option key={d.id} value={d.id}>{d.department || d.name} — {d.name}</option>)}</select></label>}
    {canAssign && <button name="operation" value={member ? "move" : "add"} disabled={pending || !departments.length} className="rounded bg-sky-700 px-3 py-2 disabled:opacity-50">{member ? "Cambiar departamento" : "Agregar integrante"}</button>}
    {member && <button name="operation" value="remove" disabled={pending} className="rounded border border-rose-500 px-3 py-2">Quitar</button>}
    <p role="status" className="w-full text-slate-300">{state.message}</p>
  </form>;
}
