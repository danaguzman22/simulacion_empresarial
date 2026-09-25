"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  getAuthenticatedUserId,
} from "@/features/auth/application/get-authenticated-user-id";

import {
  validateCompany,
} from "../domain/company";

import {
  createCompany,
} from "../repositories/company.repository";

export type CreateCompanyState = {
  error?: string;
  success?: string;
};

export async function createCompanyAction(
  _previousState: CreateCompanyState,
  formData: FormData
): Promise<CreateCompanyState> {

  const userId =
    await getAuthenticatedUserId();

  if (!userId) {
    return {
      error:
        "Tu sesión no es válida. Volvé a iniciar sesión.",
    };
  }

  const name =
    formData.get("name");

  const description =
    formData.get("description");

  if (
    typeof name !== "string"
  ) {
    return {
      error:
        "Ingresá un nombre para la empresa.",
    };
  }

  const validationError =
    validateCompany(name);

  if (validationError) {
    return {
      error:
        validationError,
    };
  }

  try {

    await createCompany({
      name,
      institutionId: String(formData.get("institutionId") ?? ""),

      description:
        typeof description ===
        "string"
          ? description
          : null,

      createdBy:
        userId,
    });

    revalidatePath(
      "/master"
    );

    return {
      success:
        "Empresa creada correctamente.",
    };

  } catch (error) {

    console.error(
      "Error creando empresa:",
      error
    );

    return {
      error:
        "No se pudo crear la empresa.",
    };
  }
}