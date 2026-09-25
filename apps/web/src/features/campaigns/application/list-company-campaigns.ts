import "server-only";

import { getMasterCompany } from "@/features/companies/application/get-master-company";
import { findCampaignsByCompany } from "../repositories/campaign.repository";

export async function listCompanyCampaigns(companyId: string) {
  const result = await getMasterCompany(companyId);

  if (result.status !== "found") {
    return result;
  }

  const campaigns = await findCampaignsByCompany(result.company.id, result.company.createdBy);
  return { ...result, campaigns };
}
