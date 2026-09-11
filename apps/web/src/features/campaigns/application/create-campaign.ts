"use server";

import { revalidatePath } from "next/cache";
import { getMasterCompany } from "@/features/companies/application/get-master-company";
import { validateCampaignName } from "../domain/campaign";
import { createCampaign } from "../repositories/campaign.repository";

export type CreateCampaignState = {
  error?: string;
  success?: string;
};

export async function createCampaignAction(
  _previousState: CreateCampaignState,
  formData: FormData
): Promise<CreateCampaignState> {
  const companyId = formData.get("companyId");
  const name = formData.get("name");
  const description = formData.get("description");

  if (
    typeof companyId !== "string" ||
    typeof name !== "string" ||
    (description !== null && typeof description !== "string")
  ) {
    return { error: "Los datos enviados no son válidos." };
  }

  try {
    const result = await getMasterCompany(companyId);

    if (result.status === "unauthenticated") {
      return { error: "Tu sesión no es válida. Volvé a iniciar sesión." };
    }

    if (result.status === "not-found") {
      return { error: "No tenés acceso a esta empresa." };
    }

    const validationError = validateCampaignName(name);
    if (validationError) {
      return { error: validationError };
    }

    await createCampaign({
      companyId: result.company.id,
      name,
      description,
      // getMasterCompany verifies that this owner is the authenticated user.
      createdBy: result.company.createdBy,
    });

    revalidatePath(`/master/empresas/${result.company.id}`);
    return { success: "Campaña creada correctamente." };
  } catch (error) {
    console.error("Error creando campaña:", error);
    return { error: "No se pudo crear la campaña. Intentá nuevamente." };
  }
}
