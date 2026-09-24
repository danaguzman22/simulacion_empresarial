import { RoleCards } from "@/features/cards/components/RoleCards";
import { GamePeriodConfiguration } from "@/features/rounds/components/GamePeriodConfiguration";
import { GameRules } from "@/features/rules/components/GameRules";
import { GameRecords } from "@/features/records/components/GameRecords";
import { GameSituations } from "@/features/situations/components/GameSituations";
import { GameGoals } from "@/features/goals/components/GameGoals";
import { GameRounds } from "@/features/rounds/components/GameRounds";
import { GameLifecycle } from "@/features/games/components/GameLifecycle";
import { notFound, redirect } from "next/navigation";
import { getGamePreparation } from "@/features/preparation/application/get-game-preparation";
import { InitialConfiguration } from "@/features/preparation/components/InitialConfiguration";
import { GameDetail } from "@/features/games/components/GameDetail";
import { GameKpiControls } from "@/features/kpis/components/GameKpiControls";

export const dynamic = "force-dynamic";

type GamePageProps = {
  params: Promise<{ id: string }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params;
  const result = await getGamePreparation(id);

  if (result.status === "unauthenticated") {
    redirect("/login/master");
  }

  if (result.status === "not-found") {
    notFound();
  }

  return (
    <GameDetail game={result.game}>
      <InitialConfiguration gameId={result.game.id} data={result.preparation} />
      <GamePeriodConfiguration gameId={result.game.id} />
      <RoleCards scope={{ kind: "game", id: result.game.id }} />
      <GameRules gameId={result.game.id} />
      <GameGoals gameId={result.game.id} />
      <GameLifecycle gameId={result.game.id} />
      {["active","paused","evaluation","completed"].includes(result.game.status) && <GameSituations gameId={result.game.id} />}
      {(result.game.status === "active" || result.game.status === "evaluation") && <GameRounds gameId={result.game.id} />}
      {(result.game.status === "active" || result.game.status === "evaluation") && <GameKpiControls gameId={result.game.id} />}
      <GameRecords gameId={result.game.id} />
    </GameDetail>
  );
}
