import "server-only";
import { createHash } from "node:crypto";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { SIGNED_OUT_KEY } from "../domain/session-watch";

// #72: opaque key of the current session for SessionWatch. A hash, so the browser storage never holds the id,
// name or e-mail of the person.
export async function currentSessionKey() {
  const userId = await getAuthenticatedUserId();
  return userId ? createHash("sha256").update(`nexus-session:${userId}`).digest("hex").slice(0, 32) : SIGNED_OUT_KEY;
}
