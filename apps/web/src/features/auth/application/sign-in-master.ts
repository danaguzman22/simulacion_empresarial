"use server";

import {
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

export type SignInMasterState = {
  error?: string;
};

export async function signInMaster(
  _previousState: SignInMasterState,
  formData: FormData
): Promise<SignInMasterState> {

  const email =
    formData.get("email");

  const password =
    formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return {
      error:
        "Completá email y contraseña.",
    };
  }

  const supabase =
    await createClient();

  const {
    error,
  } =
    await supabase.auth
      .signInWithPassword({
        email,
        password,
      });

  if (error) {
    return {
      error:
        "Email o contraseña incorrectos.",
    };
  }

  redirect("/master");
}