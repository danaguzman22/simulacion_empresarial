import type { GameListItem } from "../domain/game";
import { CreateGameForm } from "./CreateGameForm";
import { GameList } from "./GameList";

type Props = {
  campaignId: string;
  games: GameListItem[];
  canCreateGame: boolean;
};

export function CampaignGames({ campaignId, games, canCreateGame }: Props) {
  return (
    <section aria-label="Partidas de la campaña" className={`mt-8 grid gap-8 ${canCreateGame ? "lg:grid-cols-[380px_1fr]" : ""}`}>
      {canCreateGame && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <h2 className="text-2xl font-black">Crear partida</h2>
          <div className="mt-6"><CreateGameForm campaignId={campaignId} /></div>
        </div>
      )}
      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black">Partidas</h2>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400">{games.length}</span>
        </div>
        <GameList games={games} />
      </div>
    </section>
  );
}
