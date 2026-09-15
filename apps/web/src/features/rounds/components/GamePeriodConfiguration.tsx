import { getPeriodConfiguration } from "../application/period-actions";
import { PeriodConfigurationForm } from "./PeriodConfigurationForm";
export async function GamePeriodConfiguration({ gameId }: { gameId: string }) {
 const data = await getPeriodConfiguration(gameId);
 return <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6" aria-label="Configuración de períodos"><h2 className="text-2xl font-black">Configuración de períodos</h2><PeriodConfigurationForm key={data.revision} gameId={gameId} data={data}/></section>;
}
