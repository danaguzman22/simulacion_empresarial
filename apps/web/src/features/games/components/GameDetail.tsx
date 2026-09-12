import Link from "next/link";
import type { ReactNode } from "react";
import type { getGameDetail } from "../application/get-game-detail";
import { gameStatusLabels, gameTypeLabels } from "../domain/game";

type GameDetailProps = Pick<
  Extract<Awaited<ReturnType<typeof getGameDetail>>, { status: "found" }>,
  "game"
> & { children?: ReactNode };

export function GameDetail({ game, children }: GameDetailProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/master/campanas/${game.campaignId}`}
          className="rounded text-xs font-black uppercase tracking-widest text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
        >
          ← Volver a la campaña
        </Link>

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
        </article>
        {children}

        <section aria-label="Próximas secciones de la partida" className="mt-8 grid gap-5 md:grid-cols-2">
          {["Rondas", "Sala activa"].map((title) => (
            <div key={title} className="rounded-3xl border border-dashed border-white/10 p-6">
              <h2 className="text-xl font-black">{title}</h2>
              <p className="mt-3 text-sm text-slate-400">Próximamente</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
