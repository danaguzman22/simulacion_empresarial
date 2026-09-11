import "server-only";

import {
  createClient,
} from "@/lib/supabase/server";

export async function getAuthenticatedUserId():
  Promise<string | null> {

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.getClaims();

  if (
    error ||
    !data?.claims
  ) {
    return null;
  }

  const userId =
    data.claims.sub;

  if (
    typeof userId !== "string"
  ) {
    return null;
  }

  return userId;
}