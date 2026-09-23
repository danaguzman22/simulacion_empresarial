import { notFound, redirect } from "next/navigation";
import { getGameRecords } from "../application/get-game-records";
import { RecordsTimeline } from "./RecordsTimeline";

export async function GameRecords({ gameId }: { gameId: string }) {
  const result = await getGameRecords(gameId);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  return <RecordsTimeline data={result.records} />;
}
