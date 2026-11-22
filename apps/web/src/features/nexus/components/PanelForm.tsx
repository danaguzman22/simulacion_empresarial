"use client";
import { useActionState } from "react";
import { nexusPanelAction } from "../application/nexus-actions";
import { limits } from "../domain/registration";

const button = "rounded border border-sky-500 px-3 py-1.5 text-sm disabled:opacity-50";
const field = "mt-1 block w-full rounded bg-slate-900 p-2 text-sm";

// #6: one small form per action of the NEXUS panel; the server and the database re-check each one.
// Rejecting has its own form with a required reason: it is never filled in automatically (D-43).
export function PanelForm({ kind, registrationId, profileId, institutionId, self }: { kind: "approve" | "reject" | "grant" | "revoke" | "add-admin"; registrationId?: string; profileId?: string; institutionId?: string; self?: boolean }) {
  const [state, action, pending] = useActionState(nexusPanelAction, { message: "" });
  return <form action={action} className="mt-2 space-y-2" onSubmit={e => {
    const question = kind === "approve" ? "Se crea la institución y quien la registró queda como su admin. ¿Aprobar?"
      : kind === "revoke" ? (self ? "Te vas a quitar el rol de admin de NEXUS. ¿Confirmar?" : "¿Quitarle el rol de admin de NEXUS?") : null;
    if (question && !window.confirm(question)) e.preventDefault();
  }}>
    <input type="hidden" name="operation" value={kind} />
    {(kind === "approve" || kind === "reject") && <input type="hidden" name="registrationId" value={registrationId} />}
    {kind === "approve" && <button className={button} disabled={pending}>Aprobar</button>}
    {kind === "reject" && <>
      <label className="block text-sm">Motivo del rechazo (obligatorio; lo ve quien la registró)
        <textarea name="reason" required minLength={limits.reason[0]} maxLength={limits.reason[1]} rows={2} className={field} /></label>
      <button className={button} disabled={pending}>Rechazar</button>
    </>}
    {kind === "grant" && <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-64 flex-1 text-sm">Correo de la cuenta registrada<input name="email" type="email" required maxLength={254} className={field} /></label>
      <button className={button} disabled={pending}>Nombrar admin de NEXUS</button>
    </div>}
    {kind === "add-admin" && <><input type="hidden" name="institutionId" value={institutionId} />
      <label className="block text-sm">Correo de la cuenta registrada<input name="email" type="email" required maxLength={254} className={field} /></label>
      <label className="block text-sm">Motivo (obligatorio; queda registrado)<textarea name="reason" required minLength={limits.reason[0]} maxLength={limits.reason[1]} rows={2} className={field} /></label>
      <button className={button} disabled={pending}>Agregar admin</button></>}
    {kind === "revoke" && <><input type="hidden" name="profileId" value={profileId} />
      <button className={button} disabled={pending}>{self ? "Quitarme el rol" : "Quitar el rol"}</button></>}
    <p role="status" className="text-sm text-slate-300">{state.message}</p>
  </form>;
}
