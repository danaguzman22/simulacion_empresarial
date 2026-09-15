import { getRounds } from "../application/round-actions";
import { RoundsPanel } from "./RoundsPanel";
export async function GameRounds({gameId}:{gameId:string}){return <RoundsPanel gameId={gameId} initial={await getRounds(gameId)}/>;}
