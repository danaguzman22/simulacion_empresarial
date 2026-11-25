"use client";
import { useId, useState } from "react";

export type Candidate = { id: string; name: string; email: string };

// Equipos: choose the member from a searchable list (active members of the institution not yet in this game, sent
// only to whoever can edit the teams). "¿No aparece?" switches to typing the registered e-mail, as before.
// The form sends profileId (from the list) or email (typed); the server validates both the same way.
export function MemberPicker({ candidates }: { candidates: Candidate[] }) {
  const [typing, setTyping] = useState(candidates.length === 0);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const listId = useId();
  const text = query.trim().toLowerCase();
  const matches = candidates.filter(c => !text || c.name.toLowerCase().includes(text) || c.email.toLowerCase().includes(text)).slice(0, 50);
  if (typing) return <div className="w-full sm:w-80">
    <label className="block">Correo registrado<input className="block w-full rounded bg-slate-900 p-2" type="email" name="email" required maxLength={254} /></label>
    {candidates.length > 0 && <button type="button" onClick={() => setTyping(false)} className="mt-1 text-xs text-sky-300 hover:underline">Elegir de la lista</button>}
  </div>;
  return <div className="w-full sm:w-80">
    <input type="hidden" name="profileId" value={chosen?.id ?? ""} />
    {chosen ? <div className="flex items-center justify-between gap-2 rounded bg-slate-900 p-2">
      <span><b>{chosen.name}</b> <span className="text-slate-400">{chosen.email}</span></span>
      <button type="button" onClick={() => setChosen(null)} className="text-xs text-sky-300 hover:underline">Cambiar</button>
    </div> : <>
      <label className="block">Integrante<input role="combobox" aria-expanded="true" aria-controls={listId} autoComplete="off" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Buscar por nombre o correo" className="block w-full rounded bg-slate-900 p-2" /></label>
      <ul id={listId} role="listbox" aria-label="Miembros de la institución" className="mt-1 max-h-48 overflow-y-auto rounded border border-white/10">
        {matches.map(c => <li key={c.id} role="option" aria-selected="false">
          <button type="button" onClick={() => { setChosen(c); setQuery(""); }} className="block w-full px-2 py-1.5 text-left hover:bg-white/10">
            <b>{c.name}</b> <span className="text-slate-400">{c.email}</span>
          </button>
        </li>)}
        {!matches.length && <li className="px-2 py-1.5 text-slate-400">Nadie coincide con «{query.trim()}».</li>}
      </ul>
    </>}
    <button type="button" onClick={() => { setChosen(null); setTyping(true); }} className="mt-1 text-xs text-sky-300 hover:underline">¿No aparece? Escribir el correo</button>
  </div>;
}
