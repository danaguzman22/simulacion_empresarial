"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { addResponsibilityAction, cardAction } from "../application/card-actions";
import { gameCardFields, responsibilityKey, selectedResponsibilities, type CardScope, type CardView } from "../domain/card";
import { CardStructureEditor, type StructureSection } from "./CardStructureEditor";
import { effectiveModifiers, type CardStructure, type ModifierDefinition } from "../domain/card-structure";
import { cardPresets } from "../domain/card-presets";

const labels = { name: "Nombre del rol", department: "Departamento", description: "Descripción", responsibilities: "Responsabilidades", publicInformation: "Información pública", visualIdentity: "Identificación visual (texto o emoji)", individualObjective: "Objetivo individual o del departamento", privateInformation: "Información privada · Solo Master", secretObjective: "Objetivo secreto · Solo Master" };
type Section = "identidad" | "responsabilidades" | StructureSection | "objetivos";
// #78: the card in its own screen, one section at a time (side menu). Every section stays mounted (only hidden), so
// changing section never loses what was typed and the whole card is saved at once, as before.
export function CardForm({ scope, card, catalogue, modifierCatalogue, doneHref }: { scope: CardScope; card?: CardView; catalogue: { label: string }[]; modifierCatalogue: ModifierDefinition[]; doneHref: string }) {
  const [state, action, pending] = useActionState(cardAction, {});
  const router = useRouter();
  const [section, setSection] = useState<Section>("identidad");
  // After saving, back to the list of cards (it shows the saved card).
  useEffect(() => { if (state.success) router.push(doneHref); }, [state, router, doneHref]);
  const [fields, setFields] = useState(() => Object.fromEntries(gameCardFields.map(key => [key, card?.[key] ?? ""])));
  const [structure,setStructure] = useState<CardStructure>(() => ({ configuredModifiers: card ? effectiveModifiers(card) : [], abilities: card?.abilities ?? [], weaknesses: card?.weaknesses ?? [], restrictions: card?.restrictions ?? [] }));
  const [selected, setSelected] = useState(() => card ? selectedResponsibilities(card) : []);
  const [added, setAdded] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [catalogueError, setCatalogueError] = useState("");
  const [adding, startAdding] = useTransition();
  const choices = [...new Map([...catalogue.map(c => c.label), ...cardPresets.flatMap(p => p.responsibilities), ...(card ? selectedResponsibilities(card) : []), ...added, ...selected].map(label => [responsibilityKey(label), label])).values()];
  const checked = new Set(selected.map(responsibilityKey));
  const sections: { key: Section; label: string; count?: number }[] = [
    { key: "identidad", label: "Identidad e información" },
    { key: "responsabilidades", label: "Responsabilidades", count: selected.length },
    { key: "modificadores", label: "Modificadores", count: structure.configuredModifiers.length },
    { key: "habilidades", label: "Habilidades", count: structure.abilities.length },
    { key: "debilidades", label: "Debilidades", count: structure.weaknesses.length },
    { key: "restricciones", label: "Restricciones", count: structure.restrictions.length },
    { key: "objetivos", label: "Objetivos" },
  ];
  // A required field in a hidden section: open that section and show the browser's message there.
  function showInvalid(event: FormEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement, panel = field.closest<HTMLElement>("[data-section]");
    if (!panel || !panel.hidden) return;
    event.preventDefault();
    setSection(panel.dataset.section as Section);
    requestAnimationFrame(() => field.reportValidity());
  }
  function applyPreset(id: string) {
    const preset = cardPresets.find(p => p.id === id);
    if (!preset) return;
    setFields(old => ({ ...old, ...preset.fields }));
    setStructure({ configuredModifiers: preset.configuredModifiers.map(m=>({...m})), abilities: preset.abilities.map(a=>({...a})), weaknesses: preset.weaknesses.map(w=>({...w})), restrictions: preset.restrictions.map(r=>({...r})) });
    setSelected([...preset.responsibilities]);
  }
  function addCustom() {
    setCatalogueError("");
    startAdding(async () => {
      try {
        const result = await addResponsibilityAction(scope, custom);
        if (!result.label) { setCatalogueError(result.error ?? "No se pudo guardar."); return; }
        const label = result.label;
        setAdded(old => [...old, label]);
        setSelected(old => old.some(v => responsibilityKey(v) === responsibilityKey(label)) ? old : [...old, label]);
        setCustom("");
      } catch { setCatalogueError("No se pudo guardar. Intentá nuevamente."); }
    });
  }
  return <form action={action} onInvalidCapture={showInvalid} className="space-y-5">
    <input type="hidden" name="kind" value={scope.kind} /><input type="hidden" name="scopeId" value={scope.id} /><input type="hidden" name="operation" value="save" />
    <input type="hidden" name="cardId" value={card?.id ?? ""} /><input type="hidden" name="revision" value={card?.revision ?? 0} />
    <label className="block text-sm">Ficha prediseñada<select defaultValue="" onChange={e => applyPreset(e.target.value)} className="mt-1 block w-full rounded-xl border border-white/15 bg-slate-950 p-3"><option value="">Elegir una plantilla…</option>{cardPresets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <p className="text-xs text-slate-400">Elegir una plantilla completa los campos públicos, responsabilidades, modificadores y habilidades de todas las secciones. Podés editarlos antes de guardar.</p>
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
    <nav aria-label="Secciones de la ficha" className="overflow-x-auto md:overflow-visible">
      <ul className="flex min-w-max gap-2 border-b border-white/10 pb-2 md:min-w-0 md:flex-col md:border-b-0 md:border-r md:pb-0 md:pr-4">
        {sections.map(s => <li key={s.key}><button type="button" onClick={() => setSection(s.key)} aria-current={section === s.key ? "step" : undefined}
          className={`flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2 text-left text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${section === s.key ? "bg-sky-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
          {s.label}{s.count !== undefined && <span className={`rounded-full px-2 text-xs ${section === s.key ? "bg-slate-950 text-sky-200" : "bg-white/10 text-slate-200"}`}>{s.count}</span>}
        </button></li>)}
      </ul>
    </nav>
    <div className="min-w-0 space-y-4">
    <section hidden={section !== "identidad"} data-section="identidad" className="space-y-3 rounded-xl border border-white/15 p-4"><h3 className="text-lg font-bold">Identidad e información</h3>
    {gameCardFields.filter(field => !["responsibilities", "individualObjective", "secretObjective"].includes(field)).map(field => <label key={field} className="block text-sm text-slate-300">{labels[field]}
      <textarea name={field} value={fields[field]} onChange={e => setFields(old => ({ ...old, [field]: e.target.value }))} required={field === "name"} maxLength={["name", "department", "visualIdentity"].includes(field) ? 160 : 5000} rows={["name", "department", "visualIdentity"].includes(field) ? 1 : 3} className="mt-1 block w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-white" />
    </label>)}
    </section>
    <section hidden={section !== "responsabilidades"} data-section="responsabilidades" className="rounded-xl border border-white/15 p-4"><h3 className="text-lg font-bold">Responsabilidades ({selected.length})</h3>
    <fieldset className="mt-3"><legend className="sr-only">Responsabilidades</legend>
      <div className="max-h-64 space-y-2 overflow-y-auto">{choices.map(label => <label key={responsibilityKey(label)} className="flex items-start gap-2 text-sm"><input type="checkbox" name="responsibility" value={label} checked={checked.has(responsibilityKey(label))} onChange={e => setSelected(old => e.target.checked ? [...old, label] : old.filter(v => responsibilityKey(v) !== responsibilityKey(label)))} /><span className="whitespace-pre-wrap break-words">{label}</span></label>)}</div>
      <label className="mt-4 block text-sm">Responsabilidad personalizada<textarea value={custom} onChange={e => setCustom(e.target.value)} maxLength={5000} rows={2} className="mt-1 w-full rounded-xl bg-slate-950 p-2" /></label>
      <button type="button" disabled={adding || !custom.trim()} onClick={addCustom} className="mt-2 rounded-xl border border-sky-400 px-3 py-2 text-sm disabled:opacity-50">{adding ? "Guardando…" : "Agregar responsabilidad personalizada"}</button>
      <p className="mt-2 text-xs text-slate-400">Se guarda en tu catálogo y queda seleccionada. Guardá la ficha para confirmar su selección. Quitar una selección no elimina la responsabilidad del catálogo.</p>
      {catalogueError && <p role="alert" className="text-red-300">{catalogueError}</p>}
    </fieldset>
    </section>
    <CardStructureEditor scope={scope} value={structure} onChange={setStructure} catalogue={modifierCatalogue} section={section} />
    <section hidden={section !== "objetivos"} data-section="objetivos" className="rounded-xl border border-white/15 p-4"><h3 className="text-lg font-bold">Objetivos del personaje</h3>
      {([['individualObjective','Objetivo público'],['secretObjective','Objetivo secreto · Solo Master']] as const).map(([key,label])=><label key={key} className="mt-3 block text-sm">{label}<textarea name={key} rows={3} maxLength={5000} value={fields[key]} onChange={e=>setFields(old=>({...old,[key]:e.target.value}))} className="mt-1 block w-full rounded-xl bg-slate-950 p-3"/></label>)}
      <p className="mt-2 text-xs text-slate-400">Son objetivos del rol, independientes de las metas generales de la partida.</p>
    </section>
    </div>
    </div>
    {scope.kind === "campaign" && <p className="text-sm text-slate-400">Los cambios se usarán al copiar esta base. No modifican fichas que ya pertenecen a una partida.</p>}
    {state.error && <p role="alert" className="text-red-300">{state.error}</p>}{state.success && <p role="status" className="text-emerald-300">{state.success}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending || adding} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Guardando…" : card ? "Guardar ficha" : "Crear ficha base"}</button>
      <Link href={doneHref} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancelar</Link>
    </div>
  </form>;
}
export function AddCardForm({ gameId, available }: { gameId: string; available: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(cardAction, {});
  return <form action={action} className="mt-4 space-y-3">
    <input type="hidden" name="kind" value="game" /><input type="hidden" name="scopeId" value={gameId} /><input type="hidden" name="operation" value="add" />
    <label className="block text-sm">Agregar ficha de campaña<select name="sourceId" required className="ml-3 rounded-xl border border-white/15 bg-slate-950 p-2"><option value="">Seleccionar ficha…</option>{available.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    {state.error && <p role="alert" className="text-red-300">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    <button disabled={pending} className="rounded-xl border border-sky-400 px-4 py-2 disabled:opacity-50">Agregar copia a esta partida</button>
  </form>;
}
