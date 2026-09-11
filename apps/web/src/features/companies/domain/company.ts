export type CreateCompanyInput = {
  name: string;
  description: string | null;
  createdBy: string;
};

export function validateCompany(
  name: string
): string | null {

  const normalizedName =
    name.trim();

  if (!normalizedName) {
    return "Ingresá un nombre para la empresa.";
  }

  if (
    normalizedName.length < 2
  ) {
    return "El nombre es demasiado corto.";
  }

  return null;
}
