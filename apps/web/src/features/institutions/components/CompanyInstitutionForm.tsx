"use client";
import { useActionState } from "react";
import { institutionAction } from "../application/institution-actions";
export function CompanyInstitutionForm({ companyId, institutions }: { companyId: string; institutions: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(institutionAction, { message: "" });
  return <form action={action} className="mt-4 space-y-3" onSubmit={e => { if (!window.confirm("La empresa dejará de usar el acceso legado. ¿Confirmar la vinculación institucional?")) e.preventDefault(); }}>
    <input type="hidden" name="operation" value="link" /><input type="hidden" name="companyId" value={companyId} />
    <label className="block">Institución<select name="institutionId" required className="ml-3 rounded bg-slate-900 p-2"><option value="">Seleccionar institución</option>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
    <button disabled={pending} className="rounded bg-sky-700 px-4 py-2 disabled:opacity-50">Vincular empresa</button><p role="status">{state.message}</p>
  </form>;
}
