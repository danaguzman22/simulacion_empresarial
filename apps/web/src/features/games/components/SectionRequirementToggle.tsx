"use client";
import { useActionState, useRef } from "react";
import { sectionRequirementAction } from "../application/section-requirement-actions";
import type { RequirementSection } from "../domain/section-requirement";

export function SectionRequirementToggle({ gameId, section, required, revision }: { gameId: string; section: RequirementSection; required: boolean; revision: number }) {
  const [state, action, pending] = useActionState(sectionRequirementAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="flex flex-wrap items-center gap-3" onSubmit={e => {
    operationId.current ??= crypto.randomUUID();
    (e.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="section" value={section} />
    <input type="hidden" name="required" value={String(!required)} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="operationId" defaultValue="" />
    <button type="submit" role="switch" aria-checked={required} disabled={pending}
      className={`flex items-center gap-3 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${required ? "bg-sky-300 text-slate-950" : "bg-white/10 text-slate-200"}`}>
      <span aria-hidden className={`inline-block h-4 w-8 rounded-full p-0.5 ${required ? "bg-slate-950/30" : "bg-white/20"}`}><span className={`block h-3 w-3 rounded-full bg-white transition ${required ? "translate-x-4" : ""}`} /></span>
      {pending ? "Guardando…" : "Obligatorio"}
    </button>
    {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
  </form>;
}
