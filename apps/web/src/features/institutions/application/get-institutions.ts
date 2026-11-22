import "server-only";
import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { myInstitutions, readInstitution } from "../repositories/institution.repository";
import { InstitutionError } from "../domain/institution";
import { myRegistrations } from "@/features/nexus/repositories/nexus.repository";
export async function getMyInstitutions(search: string) {
  const actor = await getAuthenticatedUserId(); if (!actor) redirect("/login");
  // #6: the person's institution registrations go to "Mis solicitudes" too, with the rejection reason.
  const [data, registrations] = await Promise.all([myInstitutions(actor, search), myRegistrations(actor)]);
  return { ...data, registrations };
}
export async function getInstitution(id: string) {
  const actor = await getAuthenticatedUserId(); if (!actor) redirect("/login");
  try { return await readInstitution(actor, id); } catch (e) { if (e instanceof InstitutionError) notFound(); throw e; }
}
