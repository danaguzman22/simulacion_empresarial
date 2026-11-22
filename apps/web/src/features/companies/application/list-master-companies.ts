import "server-only";

import {
  findCompaniesCreatedBy,
} from "../repositories/company.repository";

export async function listMasterCompanies(
  profileId: string,
  institutionId?: string | null
) {
  return findCompaniesCreatedBy(
    profileId,
    institutionId
  );
}