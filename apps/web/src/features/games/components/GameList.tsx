import { gameStatusLabels, gameTypeLabels, type GameListItem } from "../domain/game";

export function GameList({ games }: { games: GameListItem[] }) {
  if (games.length === 0) {
    return <p className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">Esta campaña todavía no tiene partidas.</p>;
  }

  return (
    <ul className="space-y-4">
      {games.map((game) => (
        <li key={game.id} className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <p className="text-xs font-black uppercase tracking-widest text-sky-400">Partida {game.sequence}</p>
          <h3 className="mt-2 break-words text-xl font-black">{game.name}</h3>
          <p className="mt-2 text-sm text-slate-300">{gameTypeLabels[game.type]} · {gameStatusLabels[game.status]}</p>
          {game.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{game.description}</p>}
        </li>
      ))}
    </ul>
  );
}
