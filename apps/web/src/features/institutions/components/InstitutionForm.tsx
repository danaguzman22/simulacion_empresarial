"use client";
import { useActionState } from "react";
import { institutionAction } from "../application/institution-actions";
export function InstitutionForm({ institutionId, kind, entityId = "", revision = 0, role }: { institutionId: string; kind: "request" | "resolve" | "member" | "link"; entityId?: string; revision?: number; role?: string }) {
  const [state, action, pending] = useActionState(institutionAction, { message: "" });
  const button = "rounded border border-sky-500 px-3 py-2 text-sm disabled:opacity-50";
  return <form action={action} className="mt-3 flex flex-wrap gap-3" onSubmit={e => {
    const operation = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if ((operation === "link" || operation === "revoke" || operation === "teacher") && !window.confirm(operation === "link" ? "La vinculación es permanente: deja de aplicarse el acceso legado. ¿Confirmar?" : "¿Confirmar el cambio de permisos?")) e.preventDefault();
  }}>
    <input type="hidden" name="institutionId" value={institutionId} /><input type="hidden" name="revision" value={revision} />
    {kind === "request" && <><label className="w-full text-sm">Mensaje opcional<textarea name="message" maxLength={1000} className="mt-1 block w-full rounded bg-slate-900 p-2" /></label><button className={button} disabled={pending} name="operation" value="request">Solicitar acceso</button></>}
    {kind === "resolve" && <><input type="hidden" name="requestId" value={entityId} /><button className={button} disabled={pending} name="operation" value="approved">Aprobar como miembro</button><button className={button} disabled={pending} name="operation" value="rejected">Rechazar</button></>}
    {kind === "member" && <><input type="hidden" name="memberId" value={entityId} /><button className={button} disabled={pending} name="operation" value={role === "teacher" ? "member" : "teacher"}>{role === "teacher" ? "Quitar habilitación para crear empresas" : "Habilitar creación de empresas"}</button><button className={button} disabled={pending} name="operation" value="revoke">Revocar membresía</button></>}
    {kind === "link" && <><input type="hidden" name="companyId" value={entityId} /><button className={button} disabled={pending} name="operation" value="link">Vincular a esta institución</button></>}
    <p role="status" className="w-full text-sm text-slate-300">{state.message}</p>
  </form>;
}
