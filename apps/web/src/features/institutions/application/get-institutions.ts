import "server-only";
import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { myInstitutions, readInstitution } from "../repositories/institution.repository";
import { InstitutionError } from "../domain/institution";
export async function getMyInstitutions(search: string) {
  const actor = await getAuthenticatedUserId(); if (!actor) redirect("/login");
  return myInstitutions(actor, search);
}
export async function getInstitution(id: string) {
  const actor = await getAuthenticatedUserId(); if (!actor) redirect("/login");
  try { return await readInstitution(actor, id); } catch (e) { if (e instanceof InstitutionError) notFound(); throw e; }
}
