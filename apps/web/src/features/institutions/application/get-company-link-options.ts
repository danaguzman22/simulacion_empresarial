import "server-only";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { companyLinkOptions } from "../repositories/institution.repository";
export async function getCompanyLinkOptions(companyId: string) {
  const actor = await getAuthenticatedUserId();
  return actor ? companyLinkOptions(actor, companyId) : [];
}
