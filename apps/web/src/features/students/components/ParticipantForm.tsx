"use client";
import { useActionState } from "react";
import { saveAssignment } from "../application/assignment-actions";
import { MemberPicker, type Candidate } from "./MemberPicker";
export function ParticipantForm({ gameId, departments, member, canAssign = true, candidates = [] }: { gameId: string; canAssign?: boolean; candidates?: Candidate[]; departments: { id: string; name: string; department: string }[]; member?: { id: string; cardId: string; revision: number; name?: string } }) {
  const [state, action, pending] = useActionState(saveAssignment, { message: "" });
  return <form action={action} className="mt-3 flex flex-wrap items-end gap-3 text-sm" onSubmit={e => { if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "remove" && !window.confirm("¿Quitar al integrante de esta partida?")) e.preventDefault(); }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="assignmentId" value={member?.id ?? ""} />
    <input type="hidden" name="revision" value={member?.revision ?? 0} />
    {!member && <MemberPicker key={candidates.map(c => c.id).join()} candidates={candidates} />}
    {canAssign && <label>Departamento<select name="cardId" defaultValue={member?.cardId} className="block rounded bg-slate-900 p-2">{departments.map(d => <option key={d.id} value={d.id}>{d.department || d.name} — {d.name}</option>)}</select></label>}
    {canAssign && <button name="operation" value={member ? "move" : "add"} disabled={pending || !departments.length} className="rounded bg-sky-700 px-3 py-2 disabled:opacity-50">{member ? "Cambiar departamento" : "Agregar integrante"}</button>}
    {member && <button name="operation" value="remove" disabled={pending} aria-label={`Quitar a ${member.name ?? "este integrante"}`} title="Quitar de esta partida"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/60 text-lg leading-none text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">✕</button>}
    <p role="status" className="w-full text-slate-300">{state.message}</p>
  </form>;
}
