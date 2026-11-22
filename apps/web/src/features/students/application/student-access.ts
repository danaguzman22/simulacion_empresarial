import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { listAssignedGames, readAssignedCard } from "../repositories/student.repository";
import { isUuid } from "../domain/assignment";
import { getActiveInstitutionId } from "@/features/session/application/get-session";
export async function getStudentGames() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/alumno");
  // #72: only the games of the active institution (D-32, D-39).
  return listAssignedGames(actor, await getActiveInstitutionId());
}
export async function getStudentCard(gameId: string) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/alumno");
  if (!isUuid(gameId)) notFound();
  const result = await readAssignedCard(gameId, actor);
  if (!result) notFound();
  return result;
}
