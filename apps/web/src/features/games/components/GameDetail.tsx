import { GameCrumbs } from "./GameCrumbs";
import type { ReactNode } from "react";
import type { getGameDetail } from "../application/get-game-detail";
import { gameStatusLabels, gameTypeLabels } from "../domain/game";

type GameDetailProps = Pick<
  Extract<Awaited<ReturnType<typeof getGameDetail>>, { status: "found" }>,
  "game"
> & { children?: ReactNode; actions?: ReactNode; nav?: ReactNode };

export function GameDetail({ game, children, actions, nav }: GameDetailProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <GameCrumbs gameBase={`/master/partidas/${game.id}`} items={[{ label: "Panel", href: "/master" }, { label: game.companyName, href: game.canOpenCompany ? `/master/empresas/${game.companyId}` : undefined }, { label: game.campaignName, href: `/master/campanas/${game.campaignId}` }, { label: game.name }]} />

        <article className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
          <header>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-400">
              Partida {game.sequence}
            </p>
            <h1 className="mt-3 break-words text-4xl font-black tracking-tight">
              {game.name}
            </h1>
          </header>

          <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
            {game.description || "Sin descripción."}
          </p>

          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="mb-2 text-sm text-slate-400">Tipo</dt>
              <dd className="font-bold">{gameTypeLabels[game.type]}</dd>
            </div>
            <div>
              <dt className="mb-2 text-sm text-slate-400">Estado</dt>
              <dd className="font-bold text-sky-400">{gameStatusLabels[game.status]}</dd>
            </div>
            <div>
              <dt className="mb-2 text-sm text-slate-400">Campaña</dt>
              <dd className="break-words font-bold">{game.campaignName}</dd>
            </div>
            <div>
              <dt className="mb-2 text-sm text-slate-400">Fecha de creación</dt>
              <dd>
                <time dateTime={game.createdAt.toISOString()}>
                  {game.createdAt.toLocaleDateString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                  })}
                </time>
              </dd>
            </div>
          </dl>
          {actions}
        </article>
        {nav}
        {children}
      </div>
    </main>
  );
}
