import { dateTime } from "../domain/format";
import { companySectors, companySizes, countries, educationLevels, institutionKindLabels, organizationKinds } from "../domain/registration";

// #6: the data of a registration or an institution, its contacts and its actions. Private data (contacts, tax id):
// only rendered on screens of NEXUS admins or of the institution's own admins (the reads check it).
type Profile = { name?: string | null; legalName?: string | null; displayName?: string | null; kind?: string | null; educationLevel?: string | null; sector?: string | null;
  companySize?: string | null; organizationKind?: string | null; taxId?: string | null; website?: string | null; country?: string | null; province?: string | null;
  locality?: string | null; postalCode?: string | null; address?: string | null };
const pick = (map: Record<string, string>, key?: string | null) => key ? map[key] ?? key : "";

export function ProfileData({ data }: { data: Profile }) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Nombre legal", data.legalName ?? data.name], ["Nombre visible", data.displayName], ["Tipo", pick(institutionKindLabels, data.kind)],
    ["Nivel", pick(educationLevels, data.educationLevel)], ["Rubro", pick(companySectors, data.sector)], ["Tamaño", pick(companySizes, data.companySize)],
    ["Organización", data.organizationKind ? organizationKinds[data.organizationKind as keyof typeof organizationKinds]?.label : ""],
    [data.country === "AR" ? "CUIT" : "Identificación fiscal", data.taxId], ["Sitio web", data.website],
    ["País", pick(countries, data.country)], ["Provincia", data.province], ["Localidad", data.locality], ["Código postal", data.postalCode], ["Dirección", data.address],
  ];
  return <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents">
    <dt className="text-slate-400">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>;
}

const contactKinds: Record<string, string> = { institutional: "Contacto institucional", responsible: "Responsable principal", alternate: "Contacto alternativo" };
export type ContactRow = { id: string; kind: string; name: string | null; position: string | null; area: string | null; email: string | null; phone: string | null };
export function ContactList({ contacts }: { contacts: ContactRow[] }) {
  if (!contacts.length) return <p className="text-sm text-slate-400">Sin contactos cargados (institución anterior al registro con contactos).</p>;
  return <ul className="space-y-2 text-sm">{contacts.map(c => <li key={c.id} className="rounded-lg border border-white/10 p-3">
    <p className="font-semibold">{contactKinds[c.kind] ?? c.kind}</p>
    <p className="text-slate-300">{[c.name, c.position, c.area].filter(Boolean).join(" · ")}</p>
    <p className="text-slate-300">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
  </li>)}</ul>;
}

export const actionLabels: Record<string, string> = {
  grant_admin: "nombró admin de NEXUS a", revoke_admin: "le quitó el rol de admin de NEXUS a", approve_institution: "aprobó la institución de",
  reject_institution: "rechazó la institución de", create_institution: "creó la institución (creada por el admin de NEXUS) para", add_institution_admin: "agregó como admin a",
};
export type ActionRow = { id: string; action: string; createdAt: Date; actor: string | null; target: string | null; details?: unknown };
export function ActionList({ actions }: { actions: ActionRow[] }) {
  return <ul className="space-y-1 text-sm text-slate-300">{actions.map(a => {
    const reason = (a.details as { reason?: string } | null)?.reason;
    return <li key={a.id}>{dateTime(a.createdAt)} · {a.actor ?? "Script del operador"} {actionLabels[a.action] ?? a.action} {a.target}{reason && <span className="text-slate-400"> · Motivo: {reason}</span>}</li>;
  })}</ul>;
}
