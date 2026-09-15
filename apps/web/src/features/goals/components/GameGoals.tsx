import { getGoals } from "../application/goal-actions";
import { resultLabels } from "../domain/goal";
import { GoalForm } from "./GoalForm";
export async function GameGoals({gameId}:{gameId:string}) {
  const data = await getGoals(gameId);if(!data) return null;
  return <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8" aria-label="Metas de la partida">
    <h2 className="text-2xl font-black">{data.status === "evaluation" ? "Evaluación de metas" : "Metas de la partida"}</h2>
    {!data.goals.length && <p className="mt-4 text-slate-400">Sin metas evaluables. La partida puede finalizar sin resultado.</p>}
    <div className="mt-4 space-y-4">{data.goals.map(goal=><article key={`${goal.id}:${goal.revision}`} className="rounded-2xl border border-white/10 p-4">
      <h3 className="font-bold">{goal.title}</h3>{goal.description && <p className="mt-2 whitespace-pre-wrap">{goal.description}</p>}
      <p className="mt-2 text-sm text-slate-300">{goal.goalType === "generic" ? "Meta genérica · Evaluación manual" : `${goal.kpiName}: ${goal.targetLabel}`}</p>
      {goal.createdRoundSequence !== null && <p className="mt-2 text-sm text-slate-400">Agregada durante {goal.createdPeriodLabel} {goal.createdRoundSequence}{!goal.createdDuringRoundId ? " (ejecución reiniciada)" : ""}</p>}
      {(data.status === "evaluation" || data.status === "completed") && <>
        {data.status === "evaluation" && goal.goalType === "kpi" && <p className="mt-2">Valor actual: {goal.currentLabel}</p>}
        <p className="mt-2">{goal.suggestion === null ? "Evaluación manual · Sin sugerencia" : `Sugerencia del sistema: ${goal.suggestion ? "Cumplida" : "No cumplida"}`}</p>
        <p>Evaluación: {goal.fulfilled === null ? "Pendiente" : goal.fulfilled ? "Cumplida" : "No cumplida"}</p>
        {goal.observation && <p className="whitespace-pre-wrap">Observación: {goal.observation}</p>}
      </>}
      {data.canEdit && goal.createdRoundSequence === null && <div className="mt-3 flex flex-col gap-3"><details><summary className="cursor-pointer">Editar</summary><GoalForm data={data} goal={goal} operation="update"/></details><details><summary className="cursor-pointer text-red-300">Eliminar</summary><GoalForm data={data} goal={goal} operation="delete"/></details></div>}
      {data.canEvaluate && <GoalForm data={data} goal={goal} operation="evaluate"/>}
    </article>)}</div>
    {data.canCreate && <details className="mt-5" key={data.goals.length}><summary className="cursor-pointer font-bold">{["active","paused"].includes(data.status) ? "Agregar nueva meta" : "Agregar meta"}</summary><GoalForm data={data} operation="create"/></details>}
    {data.result && <div className="mt-5 rounded-xl bg-white/5 p-4"><h3 className="font-bold">{data.status === "completed" ? "Resultado final" : "Resultado"}</h3>
      {data.result.evaluatedCount === 0 ? <p>Sin metas evaluables</p> : <><p>{data.result.fulfilledCount} de {data.result.evaluatedCount} metas cumplidas · {(100*data.result.fulfilledCount/data.result.evaluatedCount).toFixed(2)} %</p><p className="text-lg font-bold">{resultLabels[data.result.category as keyof typeof resultLabels]}</p></>}
    </div>}
    {data.status === "evaluation" && data.goals.some(g=>g.fulfilled === null) && <p className="mt-4 text-amber-300">Evaluá todas las metas antes de finalizar la partida.</p>}
  </section>;
}
