import type { CSSProperties, ReactNode } from "react";
import { archetypeInfo, cardAccent, type Archetype } from "../domain/archetype";
import { abilityTypes, type Ability, type CardModifier, type Restriction, type Weakness } from "../domain/card-structure";
import { ArchetypeArt } from "./ArchetypeArt";

// What the card shows. It only receives what the server already lets this person see (readCards / readAssignedCard):
// private fields and secrets simply are not in the object for whoever cannot read them.
export type RoleCardData = {
  id: string; name: string; department: string; visualIdentity: string; archetype?: Archetype | null;
  configuredModifiers: CardModifier[] | null; abilities: Ability[]; weaknesses: Weakness[]; restrictions: Restriction[];
  individualObjective?: string | null;
};

const scopeLabel = (a: Ability) => a.useLimit === null ? null : `${a.useLimit} por ${a.useScope === "round" ? "ronda" : "partida"}`;

// #106: the card (view mode), with the structure of the prototype's "FICHAS TCG": art band with the archetype and the
// department color, modifiers with the highest one highlighted, abilities with use boxes, weakness in a dashed red box,
// objectives (public visible, secret covered, restriction in italics). Editing stays in the #78 screen.
export function RoleCardView({ card, secret, actions }: { card: RoleCardData; secret?: ReactNode; actions?: ReactNode }) {
  const accent = cardAccent(card);
  const archetype = card.archetype && card.archetype !== "ninguno" ? card.archetype : null;
  const mods = card.configuredModifiers ?? [];
  const top = mods.reduce<CardModifier | null>((best, m) => !best || m.value > best.value ? m : best, null);
  const style = { "--acc": accent, borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` } as CSSProperties;
  return <article style={style} className="flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900 to-slate-950 shadow-xl shadow-black/40">
    <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
      {archetype ? <ArchetypeArt archetype={archetype} idPrefix={`c${card.id}-`} />
        : <div className="grid h-full place-items-center text-6xl" style={{ background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${accent} 45%, transparent), #020617 70%)` }} aria-hidden>{card.visualIdentity || "◆"}</div>}
      <span className="pointer-events-none absolute inset-[7px] rounded-md border" style={{ borderColor: `color-mix(in srgb, ${accent} 45%, transparent)` }} />
      <span className="absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white shadow" style={{ background: `color-mix(in srgb, ${accent} 85%, black)` }}>{card.department || "Sin departamento"}</span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2.5 pt-6 text-white">
        <b className="block break-words text-lg font-black leading-tight">{archetype ? `${archetypeInfo[archetype].emoji} ` : ""}{card.name}</b>
        <span className="text-[10px] uppercase tracking-[0.17em] opacity-80">{card.department}{archetype ? ` · ${archetypeInfo[archetype].label}` : ""}</span>
      </div>
    </div>
    <div className="grid flex-1 gap-3 p-3.5">
      {mods.length > 0 && <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(mods.length, 5)}, minmax(0, 1fr))` }}>
        {mods.map(m => {
          const best = top?.key === m.key && m.value > 0;
          return <div key={m.key} title={m.name} className={`rounded-lg border px-0.5 py-1.5 text-center ${best ? "text-white" : "border-white/10 bg-slate-800/60"}`}
            style={best ? { background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 90%, black), color-mix(in srgb, ${accent} 60%, black))`, borderColor: accent, boxShadow: `0 0 16px color-mix(in srgb, ${accent} 30%, transparent)` } : undefined}>
            <div className="text-lg font-black leading-none tabular-nums">{m.value >= 0 ? "+" : ""}{m.value}</div>
            <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${best ? "" : "text-slate-400"}`}>{m.abbreviation}</div>
          </div>;
        })}
      </div>}
      {card.abilities.length > 0 && <ul className="grid gap-1.5">{card.abilities.map((a, i) => <li key={i} className="flex gap-2 rounded-lg border border-white/10 bg-slate-800/50 px-2.5 py-2 text-xs text-slate-300">
        {a.useLimit !== null && <span className="flex shrink-0 flex-col gap-0.5 pt-0.5" aria-label={`${scopeLabel(a)}`}>{Array.from({ length: Math.min(a.useLimit, 6) }, (_, k) => <span key={k} className="block size-3.5 rounded-[3px] border" style={{ borderColor: accent }} />)}</span>}
        <span><b className="block text-[13px] text-white">{a.name}</b>
          <em className="my-0.5 block text-[10px] font-extrabold uppercase not-italic tracking-[0.1em]" style={{ color: accent }}>{abilityTypes[a.type]}{scopeLabel(a) ? ` · ${scopeLabel(a)}` : ""}</em>
          <span className="whitespace-pre-wrap">{a.description}</span>{a.condition && <span className="mt-0.5 block text-slate-400">Se activa: {a.condition}</span>}</span>
      </li>)}</ul>}
      {card.weaknesses.map((w, i) => <div key={i} className="rounded-lg border border-dashed border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-200">
        <b className="mb-0.5 block text-[10px] uppercase tracking-[0.11em]">Debilidad · {w.name}</b>
        {[w.description, w.condition && `Cuándo: ${w.condition}`, w.consequence].filter(Boolean).join(" · ")}
      </div>)}
      <div className="grid gap-1.5 border-t border-white/10 pt-2.5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-amber-300">Objetivos</p>
        <p className="text-xs text-slate-300"><b className="text-[11px] uppercase tracking-wider text-white">Público</b> — {card.individualObjective || "Sin configurar."}</p>
        {secret}
        {card.restrictions.map((r, i) => <p key={i} className="text-[11px] italic text-slate-400">Restricción{r.visibility === "private" ? " (privada)" : ""}: {r.name}{r.description ? ` — ${r.description}` : ""}{r.condition ? ` (${r.condition})` : ""}</p>)}
      </div>
      {actions && <div className="relative z-10 flex flex-wrap gap-2 border-t border-white/10 pt-2.5">{actions}</div>}
    </div>
  </article>;
}
