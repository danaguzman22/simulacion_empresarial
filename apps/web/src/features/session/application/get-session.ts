import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_INSTITUTION_COOKIE, personName } from "../domain/session";
import { readProfileName, readSessionInstitutions } from "../repositories/session.repository";
import { isNexusAdmin } from "@/features/nexus/repositories/nexus.repository";

// #72: the signed-in person, read once per request. Null without a session.
// The active institution comes from the cookie only if it is one of the person's active memberships (D-39).
export const getSession = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub, email = data?.claims?.email;
  if (error || typeof userId !== "string") return null;
  const chosen = (await cookies()).get(ACTIVE_INSTITUTION_COOKIE)?.value;
  const [name, { memberships, active }, nexusAdmin] = await Promise.all([readProfileName(userId), readSessionInstitutions(userId, chosen), isNexusAdmin(userId)]);
  // email: the verified e-mail of the account (from the session claims), used as the responsible contact (#6).
  return { userId, email: typeof email === "string" ? email : null, name: personName(name, typeof email === "string" ? email : null), memberships, active, nexusAdmin };
});

// Institution the lists are filtered by: an id, or null when the person has no active membership (nothing is
// listed then). Use this in every listing of the portal and of the panel.
export async function getActiveInstitutionId() {
  return (await getSession())?.active?.id ?? null;
}
