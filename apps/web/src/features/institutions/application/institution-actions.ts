"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { InstitutionError } from "../domain/institution";
import { requestAccess, resolveRequest, changeInstitutionMember, linkLegacyCompany } from "../repositories/institution.repository";
export async function institutionAction(_: { message: string }, form: FormData) {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { message: "Iniciá sesión nuevamente." };
  const id = String(form.get("institutionId") ?? ""), operation = String(form.get("operation") ?? "");
  try {
    if (operation === "request") await requestAccess(actor, id, String(form.get("message") ?? ""));
    else if (operation === "approved" || operation === "rejected") await resolveRequest(actor, id, String(form.get("requestId") ?? ""), operation);
    else if (["revoke", "teacher", "member"].includes(operation)) await changeInstitutionMember(actor, id, String(form.get("memberId") ?? ""), Number(form.get("revision")), operation as "revoke" | "teacher" | "member");
    else if (operation === "link") await linkLegacyCompany(actor, id, String(form.get("companyId") ?? ""));
    else throw new InstitutionError("Operación inválida.");
    revalidatePath("/instituciones", "layout"); revalidatePath("/acceso"); revalidatePath("/master", "layout"); revalidatePath("/alumno", "layout");
    return { message: "Operación registrada correctamente." };
  } catch (e) { return { message: e instanceof InstitutionError ? e.message : "No se pudo completar la operación. Recargá e intentá nuevamente." }; }
}
