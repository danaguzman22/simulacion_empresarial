"use client";
import { useActionState } from "react";
import { registerInstitutionAction, type RegisterState } from "../application/nexus-actions";
import { institutionKindLabels, limits } from "../domain/registration";

// #6 (D-41): registering an institution. It stays pending (and out of every search) until a NEXUS admin approves it.
export function RegisterInstitutionForm() {
  const [state, action, pending] = useActionState(registerInstitutionAction, { message: "" } as RegisterState);
  const field = "mt-1 block w-full rounded bg-slate-900 p-2", v = state.values;
  return <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2" key={JSON.stringify(state.values ?? null) + state.message}>
    <label className="text-sm">Nombre<input name="name" defaultValue={v?.name} required minLength={limits.name[0]} maxLength={limits.name[1]} className={field} /></label>
    <label className="text-sm">Localidad<input name="locality" defaultValue={v?.locality} required minLength={limits.locality[0]} maxLength={limits.locality[1]} className={field} placeholder="Para distinguir sedes con el mismo nombre" /></label>
    <label className="text-sm">Tipo<select name="kind" required defaultValue={v?.kind ?? ""} className={field}>
      <option value="" disabled>Elegí el tipo</option>
      {Object.entries(institutionKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Mensaje para el admin de NEXUS (opcional)<textarea name="message" defaultValue={v?.message} maxLength={limits.message[1]} rows={3} className={field} /></label>
    {state.duplicates && <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100 sm:col-span-2">
      <p>Coincide con:</p><ul className="ml-5 list-disc">{state.duplicates.map(d => <li key={d}>{d}</li>)}</ul>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="confirmDuplicate" value="yes" />Es otra institución: enviarla igual</label>
    </div>}
    <div className="sm:col-span-2"><button disabled={pending} className="rounded border border-sky-500 px-3 py-2 text-sm disabled:opacity-50">Enviar solicitud</button></div>
    <p role="status" className="text-sm text-slate-300 sm:col-span-2">{state.message}</p>
  </form>;
}
