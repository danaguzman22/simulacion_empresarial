import "server-only";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { isTeacherAccount } from "../repositories/teacher-access.repository";
import { listAssignedGames } from "@/features/students/repositories/student.repository";
export async function getExperiences() {
  const actor = await getAuthenticatedUserId(); if (!actor) redirect("/login");
  const [teacher, games] = await Promise.all([isTeacherAccount(actor), listAssignedGames(actor)]);
  return { teacher, participant: games.length > 0 };
}
