"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { ACTIVE_INSTITUTION_COOKIE, areaHome, isSessionArea } from "../domain/session";
import { resolveInstitutionChoice } from "../repositories/session.repository";

// #72 / D-39: choosing the active institution. The cookie keeps only the institution id (no personal data), it is
// httpOnly, SameSite=Lax and Secure in production. It only chooses: every read still checks an active membership.
export async function chooseInstitution(form: FormData) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/");
  const area = form.get("area");
  const home = isSessionArea(area) ? areaHome[area] : "/";
  const institutionId = await resolveInstitutionChoice(actor, form.get("institutionId"));
  if (institutionId) {
    (await cookies()).set(ACTIVE_INSTITUTION_COOKIE, institutionId, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
  }
  redirect(home);
}

// Single sign-out for every screen. The other open tabs notice the change and reload (SessionWatch).
export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();
  // The next person on this browser does not inherit the previous choice.
  (await cookies()).delete(ACTIVE_INSTITUTION_COOKIE);
  redirect("/");
}
