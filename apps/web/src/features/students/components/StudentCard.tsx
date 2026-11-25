import { SecretReveal } from "@/features/secrets/components/SecretReveal";
import { selectedResponsibilities } from "@/features/cards/domain/card";
import { RoleCardView } from "@/features/cards/components/RoleCardView";
import type { readAssignedCard } from "../repositories/student.repository";
import { StudentRefresh } from "./StudentRefresh";
import { StudentClock } from "./StudentClock";

// #106: the participant's own card as a card. It receives only readAssignedCard's projection: never the secret
// objective (it is revealed through SecretReveal, which asks the server each time) nor other departments' cards.
export function StudentCard({ data }: { data: NonNullable<Awaited<ReturnType<typeof readAssignedCard>>> }) {
  const { card, game, teammates } = data;
  // The game name, status and back link live in the tab layout (/alumno/partidas/[id]/layout.tsx).
  return <div className="max-w-5xl">
    <StudentClock clock={data.clock} gameActive={game.status === "active" || game.status === "paused"} />
    <div className="mt-4 grid gap-6 md:grid-cols-[22rem_1fr]">
      <RoleCardView card={card} secret={<SecretReveal key={card.id} gameId={game.id} summary={data.reveal} />} />
      <div className="space-y-5">
        {card.description && <section><h2 className="text-lg font-bold">Descripción</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{card.description}</p></section>}
        <section><h2 className="text-lg font-bold">Responsabilidades</h2><ul className="mt-2 list-inside list-disc text-sm">{selectedResponsibilities(card).map(r => <li key={r}>{r}</li>)}</ul></section>
        {[["Información pública", card.publicInformation], ["Información privada del departamento", card.privateInformation]].map(([title, text]) => text && <section key={title}><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{text}</p></section>)}
        <section><h2 className="text-lg font-bold">Integrantes del equipo</h2><ul className="mt-2 text-sm">{teammates.map((m, i) => <li key={i}>{m.name}</li>)}</ul></section>
      </div>
    </div>
    <StudentRefresh />
  </div>;
}
