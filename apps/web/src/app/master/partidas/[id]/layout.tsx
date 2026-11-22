import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getGameDetail } from "@/features/games/application/get-game-detail";
import { getGameSetup } from "@/features/games/application/get-game-setup";
import { GameDetail } from "@/features/games/components/GameDetail";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { GameStartButton } from "@/features/games/components/GameStartButton";
import { UserBar } from "@/features/session/components/UserBar";
import { GameTabs } from "@/features/games/components/GameTabs";
import { GameCurrentPeriod } from "@/features/rounds/components/GameCurrentPeriod";
import { defaultGameTab, gameTabsFor, isPreparationStatus } from "@/features/games/domain/game-tabs";

export const dynamic = "force-dynamic";

// Shared by every tab: game header with the running period (clock, pause/resume) and lifecycle actions, then the tab bar (and "Iniciar partida" while preparing).
export default async function GameLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getGameDetail(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const { game } = result;
  const preparing = isPreparationStatus(game.status);
  const setup = preparing ? await getGameSetup(game.id) : null;
  return <><UserBar area="panel" campaignRole={result.memberRole} /><GameDetail game={game} actions={<>{(game.status === "active" || game.status === "paused") && <GameCurrentPeriod gameId={game.id} />}<GameLifecycle gameId={game.id} part="actions" /></>} nav={<div className="flex flex-wrap items-end justify-between gap-x-6">
    <GameTabs gameId={game.id} tabs={gameTabsFor(game.status)} defaultTab={defaultGameTab(game.status)} complete={setup?.complete} notes={setup ? {
      // Metas and Reglas always show a state: ✓ when complete, otherwise "Falta" (required) or "Opcional".
      metas: setup.complete.metas ? undefined : setup.requirements.goals ? "Falta" : "Opcional",
      reglas: setup.complete.reglas ? undefined : setup.requirements.rules || setup.counts.enabledRules > 0 ? "Falta" : "Opcional",
    } : undefined} />
    {preparing && <GameStartButton gameId={game.id} />}
  </div>}>{children}</GameDetail></>;
}
