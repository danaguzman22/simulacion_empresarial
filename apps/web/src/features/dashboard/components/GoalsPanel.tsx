import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { resultLabels } from "@/features/goals/domain/goal";
import { resultScale, type BoardGoal, type GoalBoard } from "../domain/goal-board";
import { DashboardPanel } from "./DashboardPanel";

function GoalState({ goal, phase }: { goal: BoardGoal; phase: GoalBoard["phase"] }) {
  const final = phase === "evaluating" || phase === "final";
  const state = final ? goal.evaluation : goal.meetsNow;
  const text = final ? (state === null ? "Sin evaluar" : state ? "Cumplida" : "No cumplida")
    : goal.kind === "generic" ? "La evalúa el Master al final" : state === null ? "Sin valor todavía" : state ? "Se cumple hoy" : "Todavía no";
  const Icon = state === true ? CheckCircle2 : state === false ? XCircle : Circle;
  return <span className={`flex shrink-0 items-center gap-1 text-xs font-bold ${state === true ? "text-emerald-700" : state === false ? "text-slate-500" : "text-slate-400"}`}>
    <Icon aria-hidden className="h-4 w-4" />{text}</span>;
}

// Goals block (#34): live progress while playing, the Master's evaluation, and the final D-10 result.
export function GoalsPanel({ board }: { board: GoalBoard }) {
  if (board.phase === "none") return <DashboardPanel eyebrow="Metas" title="Avance y resultado"><p className="mt-3 text-sm text-slate-500">Esta partida no tiene metas: no habrá resultado final.</p></DashboardPanel>;
  return <DashboardPanel eyebrow="Metas" title={board.phase === "live" ? "Avance de las metas" : "Resultado"}>
    {board.phase === "live" && board.liveSummary.measurable > 0 && <p className="mt-1 text-sm text-slate-600">Hoy se cumplen <strong>{board.liveSummary.meeting} de {board.liveSummary.measurable}</strong> metas medibles.</p>}
    {board.phase === "evaluating" && !board.result && <p className="mt-1 text-sm text-slate-600">Evaluación en curso: {board.evaluated} de {board.goals.length} metas evaluadas.</p>}
    {board.result && <div className="mt-3">
      <p className="text-3xl font-extrabold text-[#0b3159]">{board.result.label}</p>
      <p className="text-sm text-slate-600">{board.result.fulfilled} de {board.result.evaluated} metas cumplidas ({board.result.percent} %).</p>
      <ol aria-label="Escala de resultado" className="mt-3 grid grid-cols-5 gap-1">
        {resultScale.map(category => <li key={category} aria-current={category === board.result?.category ? "true" : undefined}
          className={`rounded-md px-1 py-2 text-center text-[10px] font-bold leading-tight ${category === board.result?.category ? "bg-[#0b3159] text-white" : "bg-slate-200/70 text-slate-500"}`}>{resultLabels[category]}</li>)}
      </ol>
    </div>}
    <ul className="mt-3 space-y-2">
      {board.goals.map(goal => <li key={goal.id} className="rounded-xl border border-slate-200/80 bg-white/60 p-3">
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-800">{goal.title}</p><GoalState goal={goal} phase={board.phase} /></div>
        {goal.target && <p className="mt-1 text-xs text-slate-500">Objetivo: {goal.target}{goal.current ? ` · Actual: ${goal.current}` : ""}</p>}
      </li>)}
    </ul>
  </DashboardPanel>;
}
