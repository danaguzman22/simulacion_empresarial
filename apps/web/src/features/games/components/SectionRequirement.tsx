import { getGameSetup } from "../application/get-game-setup";
import type { RequirementSection } from "../domain/section-requirement";
import { SectionRequirementToggle } from "./SectionRequirementToggle";

// D-33: "Obligatorio" switch for the Metas and Reglas tabs, shown only while the game is in preparation.
export async function SectionRequirement({ gameId, section }: { gameId: string; section: RequirementSection }) {
  const setup = await getGameSetup(gameId);
  if (!setup || !setup.preparing) return null;
  const required = setup.requirements[section], empty = section === "goals" ? setup.counts.goals === 0 : setup.counts.enabledRules === 0;
  const name = section === "goals" ? "Metas" : "Reglas";
  return <section aria-label={`Obligatoriedad de ${name}`} className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="font-bold">{required ? `${name}: obligatoria` : `${name}: opcional`}</p>
        <p className="text-sm text-slate-400">{required
          ? `Si no hay ${section === "goals" ? "ninguna meta" : "ninguna regla activa"}, no se puede iniciar la partida.`
          : "No bloquea el inicio de la partida."}</p>
      </div>
      {setup.canEditRequirements
        ? <SectionRequirementToggle gameId={gameId} section={section} required={required} revision={setup.preparationRevision} />
        : <p className="text-sm text-slate-400">Solo Master o Co-Master pueden cambiarlo.</p>}
    </div>
    {section === "goals" && !required && empty && <p role="status" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-200">Sin metas, la partida no tendrá resultado final.</p>}
  </section>;
}
