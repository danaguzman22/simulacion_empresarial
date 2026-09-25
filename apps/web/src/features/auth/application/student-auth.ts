"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function studentAuth(_: { message: string }, form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const register = form.get("operation") === "register";
  const displayName = String(form.get("displayName") ?? "").trim();
  if (!email || email.length > 254 || !password || password.length > 256 || (register && (password.length < 8 || !displayName || displayName.length > 160))) return { message: "Revisá el correo, nombre y contraseña (mínimo 8 caracteres para registrarte)." };
  const client = await createClient();
  if (register) {
    // Only presentation metadata. No role or membership can be supplied here.
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) return { message: "No se pudo completar el registro. Revisá los datos o intentá iniciar sesión." };
    if (!data.session) return { message: "Revisá tu correo para confirmar la cuenta y después iniciá sesión. Si ya tenías cuenta, usá Iniciar sesión." };
  } else {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { message: "No se pudo iniciar sesión. Revisá tus datos y la confirmación del correo." };
  }
  redirect("/acceso");
}
export async function signOutStudent() {
  const client = await createClient();
  await client.auth.signOut();
  redirect("/login/alumno");
}
