import "server-only";

import {
  findCompaniesCreatedBy,
} from "../repositories/company.repository";

export async function listMasterCompanies(
  profileId: string
) {
  return findCompaniesCreatedBy(
    profileId
  );
}