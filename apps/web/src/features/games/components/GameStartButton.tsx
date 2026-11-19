import { getGameLifecycle } from "../application/get-game-lifecycle";
import { getGameSetup } from "../application/get-game-setup";
import { StartGameControl } from "./StartGameControl";
// "Falta para iniciar" comes from the same checks the start runs (startBlockers), so the button is enabled
// exactly when the start can succeed. The start action itself validates everything again on the server.
export async function GameStartButton({ gameId }: { gameId: string }) {
  const [lifecycle, setup] = [await getGameLifecycle(gameId), await getGameSetup(gameId)];
  if (!lifecycle || !setup) return null;
  return <StartGameControl missing={setup.missing} warnings={setup.warnings}
    form={{ gameId, revision: lifecycle.revision, catalogToken: lifecycle.catalogToken, periodRevision: lifecycle.periodRevision }} />;
}
