export type CreateCampaignInput = {
  companyId: string;
  name: string;
  description: string | null;
  createdBy: string;
};

export function validateCampaignName(name: string): string | null {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return "Ingresá un nombre para la campaña.";
  }

  if (normalizedName.length < 2) {
    return "El nombre de la campaña es demasiado corto.";
  }

  return null;
}
