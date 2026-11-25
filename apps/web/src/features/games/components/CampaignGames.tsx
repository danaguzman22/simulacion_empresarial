import type { GameListItem } from "../domain/game";
import { CreateGamePanel } from "./CreateGamePanel";
import { GameList } from "./GameList";

type Props = {
  campaignId: string;
  games: GameListItem[];
  canCreateGame: boolean;
};

// #78: the list comes first; "Crear partida" opens the form only when asked for.
export function CampaignGames({ campaignId, games, canCreateGame }: Props) {
  return (
    <section aria-label="Partidas de la campaña">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-3 text-2xl font-black">Partidas <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-normal text-slate-400">{games.length}</span></h2>
        {canCreateGame && <CreateGamePanel campaignId={campaignId} />}
      </div>
      <GameList games={games} />
    </section>
  );
}
