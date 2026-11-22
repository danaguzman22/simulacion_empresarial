"use client";
import { useActionState } from "react";
import { nexusPanelAction } from "../application/nexus-actions";
import { limits } from "../domain/registration";

const button = "rounded border border-sky-500 px-3 py-1.5 text-sm disabled:opacity-50";
const field = "mt-1 block w-full rounded bg-slate-900 p-2 text-sm";

// #6: one small form per action of the NEXUS panel; the server and the database re-check each one.
export function PanelForm({ kind, registrationId, profileId, self }: { kind: "resolve" | "grant" | "revoke"; registrationId?: string; profileId?: string; self?: boolean }) {
  const [state, action, pending] = useActionState(nexusPanelAction, { message: "" });
  return <form action={action} className="mt-2 space-y-2" onSubmit={e => {
    const operation = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    const question = operation === "approve" ? "Se crea la institución y quien la registró queda como su admin. ¿Aprobar?"
      : operation === "revoke" ? (self ? "Te vas a quitar el rol de admin de NEXUS. ¿Confirmar?" : "¿Quitarle el rol de admin de NEXUS?") : null;
    if (question && !window.confirm(question)) e.preventDefault();
  }}>
    {kind === "resolve" && <>
      <input type="hidden" name="registrationId" value={registrationId} />
      <label className="block text-sm">Motivo del rechazo (obligatorio para rechazar; lo ve quien la registró)
        <textarea name="reason" maxLength={limits.reason[1]} rows={2} className={field} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={pending} name="operation" value="approve">Aprobar</button>
        <button className={button} disabled={pending} name="operation" value="reject">Rechazar</button>
      </div>
    </>}
    {kind === "grant" && <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-64 flex-1 text-sm">Correo de la cuenta registrada<input name="email" type="email" required maxLength={254} className={field} /></label>
      <button className={button} disabled={pending} name="operation" value="grant">Nombrar admin de NEXUS</button>
    </div>}
    {kind === "revoke" && <><input type="hidden" name="profileId" value={profileId} />
      <button className={button} disabled={pending} name="operation" value="revoke">{self ? "Quitarme el rol" : "Quitar el rol"}</button></>}
    <p role="status" className="text-sm text-slate-300">{state.message}</p>
  </form>;
}
