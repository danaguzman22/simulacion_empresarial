import "server-only";

import {
  getAuthenticatedUserId,
} from "@/features/auth/application/get-authenticated-user-id";

import {
  findCompanyByIdForOwner,
} from "../repositories/company.repository";

type Company = NonNullable<
  Awaited<ReturnType<typeof findCompanyByIdForOwner>>
>;

type GetMasterCompanyResult =
  | { status: "unauthenticated" }
  | { status: "not-found" }
  | { status: "found"; company: Company };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getMasterCompany(
  companyId: string
): Promise<GetMasterCompanyResult> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return { status: "unauthenticated" };
  }

  if (!uuidPattern.test(companyId)) {
    return { status: "not-found" };
  }

  const company = await findCompanyByIdForOwner(
    companyId,
    userId
  );

  if (!company) {
    return { status: "not-found" };
  }

  return { status: "found", company };
}
