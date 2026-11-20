import { SecretReveal } from "@/features/secrets/components/SecretReveal";
import { selectedResponsibilities } from "@/features/cards/domain/card";
import { CardStructureView } from "@/features/cards/components/CardStructureView";
import type { readAssignedCard } from "../repositories/student.repository";
import { StudentRefresh } from "./StudentRefresh";
import { StudentClock } from "./StudentClock";
export function StudentCard({ data }: { data: NonNullable<Awaited<ReturnType<typeof readAssignedCard>>> }) {
  const { card, game, teammates } = data;
  // The game name, status and back link live in the tab layout (/alumno/partidas/[id]/layout.tsx).
  return <div className="max-w-4xl">
    <StudentClock clock={data.clock} gameActive={game.status === "active" || game.status === "paused"} />
    <article className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-6"><p className="text-sky-300">{card.department}</p><h1 className="text-3xl font-black">{card.name}</h1>
      {card.visualIdentity && <p className="mt-2">{card.visualIdentity}</p>}<p className="mt-3 whitespace-pre-wrap">{card.description}</p>
      <h2 className="mt-5 font-bold">Responsabilidades</h2><ul className="list-inside list-disc">{selectedResponsibilities(card).map(r => <li key={r}>{r}</li>)}</ul>
      <CardStructureView card={card} privateAudience="Equipo" />
      {[['Información pública', card.publicInformation], ['Información privada del departamento', card.privateInformation], ['Objetivo del departamento', card.individualObjective]].map(([title, text]) => text && <section key={title} className="mt-5"><h2 className="font-bold">{title}</h2><p className="whitespace-pre-wrap">{text}</p></section>)}
      <SecretReveal key={card.id} gameId={game.id} summary={data.reveal} />
      <section className="mt-5"><h2 className="font-bold">Integrantes del equipo</h2><ul>{teammates.map((m, i) => <li key={i}>{m.name}</li>)}</ul></section>
    </article><StudentRefresh />
  </div>;
}
