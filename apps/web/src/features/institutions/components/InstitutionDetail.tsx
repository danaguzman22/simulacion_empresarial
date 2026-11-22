import type { readInstitution } from "../repositories/institution.repository";
import { InstitutionForm } from "./InstitutionForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ContactList, type ContactRow } from "@/features/nexus/components/InstitutionDetails";
const roleNames = { admin: "Administrador", teacher: "Docente", member: "Miembro" };
export function InstitutionDetail({ data, contacts }: { data: Awaited<ReturnType<typeof readInstitution>>; contacts?: ContactRow[] | null }) {
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-5xl"><Breadcrumbs items={[{ label: "Mis instituciones", href: "/instituciones" }, { label: data.institution.name }]} />
    <h1 className="mt-5 text-3xl font-black">{data.institution.name}</h1><p className="mt-3">Administradores: {data.admins.map(a => a.name).join(", ")}</p>
    {!data.canManage && <p className="mt-5 text-slate-300">Tu membresía no asigna automáticamente partidas ni permisos de campaña. El Master debe asignarte una ficha.</p>}
    {data.canManage && <>
      {/* #6 (D-41): private contacts, only for the admins of this institution. */}
      {contacts && <section className="mt-8"><h2 className="mb-3 text-xl font-bold">Contactos</h2><ContactList contacts={contacts} /></section>}
      <section className="mt-8"><h2 className="text-xl font-bold">Solicitudes pendientes</h2>{!data.requests.length && <p>Sin solicitudes pendientes.</p>}{data.requests.map(r => <article key={r.id} className="mt-3 rounded-xl border border-white/10 p-4"><h3 className="font-bold">{r.name}</h3><p>{r.email}</p><p className="whitespace-pre-wrap">{r.message}</p><time>{new Date(r.requested_at).toLocaleString("es-AR")}</time><InstitutionForm institutionId={data.institution.id} kind="resolve" entityId={r.id} /></article>)}</section>
      <section className="mt-8"><h2 className="text-xl font-bold">Miembros</h2><p className="text-sm text-slate-400">Habilitar creación de empresas no modifica los roles de campañas existentes.</p>{data.members.map(m => <article key={m.id} className="mt-3 rounded-xl border border-white/10 p-4"><h3>{m.name} · {roleNames[m.role]} · {m.status === "active" ? "Vigente" : "Revocada"}</h3>{m.role !== "admin" && m.status === "active" && <InstitutionForm key={`${m.id}-${m.revision}`} institutionId={data.institution.id} kind="member" entityId={m.id} revision={m.revision} role={m.role} />}</article>)}</section>
      {data.legacyCompanies.length > 0 && <section className="mt-8"><h2 className="text-xl font-bold">Tus empresas simuladas pendientes de vinculación</h2><p className="mt-1 text-sm text-slate-300">Las creaste antes de que existieran las instituciones y todavía no pertenecen a ninguna. Sus partidas siguen funcionando, pero no se pueden sumar participantes ni cambiar departamentos hasta vincularlas.</p><p className="mt-1 text-sm text-amber-300">Para vincular una a esta institución, primero aprobá acá a todas las personas que ya participan en ella: Masters, Co-Masters, Observadores y participantes asignados. NEXUS no aprueba a nadie automáticamente.</p>{data.legacyCompanies.map(c => <article key={c.id} className="mt-3 rounded-xl border border-white/10 p-4"><h3>{c.name}</h3><InstitutionForm institutionId={data.institution.id} kind="link" entityId={c.id} /></article>)}</section>}
    </>}
  </div></main>;
}
