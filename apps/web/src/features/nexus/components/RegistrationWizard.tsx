"use client";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { nexusCreateInstitutionAction, registerInstitutionAction, type RegisterState } from "../application/nexus-actions";
import {
  argentineProvinces, companySectors, companySizes, countries, educationLevels, emptyDraft, institutionKindLabels, limits, organizationKinds,
  validateStep, type RegistrationDraft, type StepErrors,
} from "../domain/registration";

type Step = 1 | 2 | 3 | 4;
const stepTitles: Record<Step, string> = { 1: "Datos de la institución", 2: "Ubicación", 3: "Contactos y responsables", 4: "Revisar y enviar" };
const field = "mt-1 block w-full rounded bg-slate-900 p-2 text-sm text-white";
const label = (map: Record<string, string>, key: string) => map[key] ?? "";

// #6 (D-41): registering an institution in 4 steps. Everything typed lives in this component's state, so moving
// between steps never loses it. Each step is validated before moving on; the server and the database validate again.
// mode "nexus": a NEXUS admin creates it for a registered person (their e-mail), approved at once (D-43).
export function RegistrationWizard({ mode, account }: { mode: "self" | "nexus"; account?: { name: string; email: string | null } }) {
  const [draft, setDraft] = useState<RegistrationDraft>(emptyDraft);
  const [adminEmail, setAdminEmail] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<StepErrors & { adminEmail?: string }>({});
  const [state, action, pending] = useActionState(mode === "nexus" ? nexusCreateInstitutionAction : registerInstitutionAction, { message: "" } as RegisterState);
  const set = <K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const check = (target: Step) => {
    const found: StepErrors & { adminEmail?: string } = validateStep(target, draft);
    if (target === 3 && mode === "nexus" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) found.adminEmail = "Correo de la cuenta del admin principal: obligatorio.";
    setErrors(found);
    return Object.keys(found).length === 0;
  };
  const next = () => { if (check(step)) setStep(s => Math.min(4, s + 1) as Step); };
  const back = () => { setErrors({}); setStep(s => Math.max(1, s - 1) as Step); };

  if (state.done) return <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
    <p>{state.message}</p>
    {mode === "nexus" && state.institutionId ? <Link href={`/nexus/instituciones/${state.institutionId}`} className="mt-2 inline-block text-sky-300 hover:underline">Ver la institución</Link>
      : <Link href="/instituciones/solicitudes" className="mt-2 inline-block text-sky-300 hover:underline">Ver Mis solicitudes</Link>}
  </div>;

  const text = (key: keyof RegistrationDraft, title: string, max: number, options: { required?: boolean; type?: string; placeholder?: string } = {}) =>
    <Labeled title={`${title}${options.required ? "" : " (opcional)"}`} error={errors[key]}>
      <input type={options.type ?? "text"} value={String(draft[key])} maxLength={max} placeholder={options.placeholder} onChange={e => set(key, e.target.value as never)} className={field} />
    </Labeled>;
  const select = (key: keyof RegistrationDraft, title: string, options: Record<string, string>) =>
    <Labeled title={title} error={errors[key]}>
      <select value={String(draft[key])} onChange={e => set(key, e.target.value as never)} className={field}>
        <option value="">Elegí una opción</option>{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </Labeled>;

  return <div>
    <ol className="flex flex-wrap gap-2 text-xs" aria-label="Pasos del registro">
      {([1, 2, 3, 4] as Step[]).map(n => <li key={n} aria-current={n === step ? "step" : undefined}
        className={`rounded-full px-3 py-1 font-semibold ${n === step ? "bg-sky-300 text-slate-950" : n < step ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-slate-400"}`}>
        {n}. {stepTitles[n]}</li>)}
    </ol>
    <h2 className="mt-5 text-lg font-bold">Paso {step} de 4 · {stepTitles[step]}</h2>

    {step === 1 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {text("legalName", "Nombre legal o razón social", limits.legalName[1], { required: true })}
      {text("displayName", "Nombre visible en NEXUS (si está vacío se usa el legal)", limits.displayName[1])}
      {select("kind", "Tipo", institutionKindLabels)}
      {draft.kind === "educational" && select("educationLevel", "Nivel", educationLevels)}
      {draft.kind === "company" && <>{select("sector", "Rubro", companySectors)}{select("companySize", "Tamaño", companySizes)}</>}
      <fieldset className="sm:col-span-2"><legend className="text-sm">Tipo de organización</legend>
        {Object.entries(organizationKinds).map(([value, kind]) => <label key={value} className="mt-2 flex gap-2 text-sm">
          <input type="radio" name="organizationKind" checked={draft.organizationKind === value} onChange={() => set("organizationKind", value)} />
          <span><strong>{kind.label}:</strong> {kind.help}</span></label>)}
        {errors.organizationKind && <p className="text-sm text-amber-300">{errors.organizationKind}</p>}
      </fieldset>
      {select("country", "País", countries)}
      {draft.country === "AR" ? text("taxId", "CUIT", 13, { placeholder: "20-12345678-6" }) : text("taxId", "Identificación fiscal", limits.taxId[1])}
      {text("website", "Sitio web", limits.website[1], { type: "url", placeholder: "https://" })}
    </div>}

    {step === 2 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {select("country", "País", countries)}
      {draft.country === "AR"
        ? select("province", "Provincia", Object.fromEntries(argentineProvinces.map(p => [p, p])))
        : text("province", "Provincia o estado", limits.province[1], { required: true })}
      {text("locality", "Localidad", limits.locality[1], { required: true })}
      {text("postalCode", "Código postal", limits.postalCode[1], { required: true })}
      <div className="sm:col-span-2">{text("address", "Dirección", limits.address[1])}</div>
    </div>}

    {step === 3 && <div className="mt-4 space-y-6">
      <section><h3 className="font-semibold">Contacto institucional</h3><p className="text-xs text-slate-400">Correo y teléfono generales de la institución.</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {text("institutionalEmail", "Correo", limits.email[1], { required: true, type: "email" })}
          {text("institutionalPhone", "Teléfono", limits.phone[1], { required: true, type: "tel" })}
        </div></section>
      <section><h3 className="font-semibold">Responsable principal</h3>
        {mode === "nexus"
          ? <><p className="text-xs text-slate-400">La persona que va a ser su admin principal. Tiene que tener una cuenta registrada en NEXUS.</p>
            <Labeled title="Correo de la cuenta del admin principal" error={errors.adminEmail}>
              <input type="email" value={adminEmail} maxLength={254} onChange={e => setAdminEmail(e.target.value)} className={field} /></Labeled></>
          : <p className="text-xs text-slate-400">Sos vos: quedás como admin principal cuando se apruebe. Nombre y correo salen de tu cuenta: <strong className="text-slate-200">{account?.name} · {account?.email}</strong></p>}
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {text("responsiblePosition", "Cargo (ej. Director/a, Jefe/a de RRHH, Docente)", limits.position[1], { required: true })}
          {text("responsibleArea", "Área o dependencia (ej. Secretaría Académica, RRHH)", limits.area[1], { required: true })}
          {text("responsiblePhone", "Teléfono", limits.phone[1], { type: "tel" })}
        </div></section>
      <section><h3 className="font-semibold">Contacto alternativo (opcional)</h3><p className="text-xs text-slate-400">Por si el responsable no responde. Es solo un dato de contacto: no crea una cuenta ni da permisos.</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {text("alternateName", "Nombre", limits.contactName[1])}
          {text("alternatePosition", "Cargo", limits.position[1])}
          {text("alternateEmail", "Correo", limits.email[1], { type: "email" })}
          {text("alternatePhone", "Teléfono", limits.phone[1], { type: "tel" })}
        </div></section>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.authorized} onChange={e => set("authorized", e.target.checked)} />
        {mode === "nexus" ? "Confirmo que la institución y su responsable me pidieron registrarla en NEXUS." : "Declaro que estoy autorizado/a a registrar esta institución en NEXUS."}</label>
      {errors.authorized && <p className="text-sm text-amber-300">{errors.authorized}</p>}
    </div>}

    {step === 4 && <div className="mt-4 space-y-4 text-sm">
      <Summary title={stepTitles[1]} onEdit={() => setStep(1)} rows={[
        ["Nombre legal", draft.legalName], ["Nombre visible", draft.displayName || draft.legalName], ["Tipo", label(institutionKindLabels, draft.kind)],
        ...(draft.kind === "educational" ? [["Nivel", label(educationLevels, draft.educationLevel)]] : []),
        ...(draft.kind === "company" ? [["Rubro", label(companySectors, draft.sector)], ["Tamaño", label(companySizes, draft.companySize)]] : []),
        ["Organización", organizationKinds[draft.organizationKind as keyof typeof organizationKinds]?.label ?? ""], [draft.country === "AR" ? "CUIT" : "Identificación fiscal", draft.taxId], ["Sitio web", draft.website],
      ]} />
      <Summary title={stepTitles[2]} onEdit={() => setStep(2)} rows={[["País", label(countries, draft.country)], ["Provincia", draft.province], ["Localidad", draft.locality], ["Código postal", draft.postalCode], ["Dirección", draft.address]]} />
      <Summary title={stepTitles[3]} onEdit={() => setStep(3)} rows={[
        ["Contacto institucional", [draft.institutionalEmail, draft.institutionalPhone].join(" · ")],
        ["Responsable principal", [mode === "nexus" ? adminEmail : `${account?.name ?? ""} (${account?.email ?? ""})`, draft.responsiblePosition, draft.responsibleArea, draft.responsiblePhone].filter(Boolean).join(" · ")],
        ["Contacto alternativo", [draft.alternateName, draft.alternatePosition, draft.alternateEmail, draft.alternatePhone].filter(Boolean).join(" · ")],
        ["Declaración", draft.authorized ? "Sí" : "No"],
      ]} />
      <form action={action} className="space-y-3">
        <input type="hidden" name="draft" value={JSON.stringify(draft)} />
        {mode === "nexus" && <input type="hidden" name="adminEmail" value={adminEmail} />}
        <Labeled title="Mensaje para el admin de NEXUS (opcional)" error={errors.message}>
          <textarea value={draft.message} maxLength={limits.message[1]} rows={3} onChange={e => set("message", e.target.value)} className={field} /></Labeled>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={back} className="rounded border border-white/20 px-3 py-2">Atrás</button>
          <button disabled={pending} className="rounded border border-sky-500 px-3 py-2 disabled:opacity-50" onClick={e => { if (!check(4)) e.preventDefault(); }}>
            {mode === "nexus" ? "Crear institución" : "Enviar solicitud"}</button>
        </div>
        <p role="status" className="text-slate-300">{state.message}</p>
      </form>
    </div>}

    {step < 4 && <div className="mt-6 flex gap-3">
      {step > 1 && <button type="button" onClick={back} className="rounded border border-white/20 px-3 py-2 text-sm">Atrás</button>}
      <button type="button" onClick={next} className="rounded border border-sky-500 px-3 py-2 text-sm">Siguiente</button>
    </div>}
  </div>;
}

function Labeled({ title, error, children }: { title: string; error?: string; children: ReactNode }) {
  return <label className="block text-sm">{title}{children}{error && <span className="mt-1 block text-amber-300">{error}</span>}</label>;
}

function Summary({ title, rows, onEdit }: { title: string; rows: string[][]; onEdit: () => void }) {
  return <section className="rounded-xl border border-white/10 p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button type="button" onClick={onEdit} className="text-sky-300 hover:underline">Editar</button></div>
    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[180px_1fr]">{rows.filter(([, value]) => value).map(([name, value]) => <div key={name} className="contents">
      <dt className="text-slate-400">{name}</dt><dd className="break-words">{value}</dd></div>)}</dl>
  </section>;
}
