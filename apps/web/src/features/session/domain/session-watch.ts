// #72: detecting a session change made in another tab. Pure functions, covered by unit tests.
export const SESSION_STORAGE_KEY = "nexus-session";
// Key used when nobody is signed in.
export const SIGNED_OUT_KEY = "none";

// A tab reloads only when another tab stored a DIFFERENT, readable key. Nothing stored (or storage unavailable)
// never triggers a reload, so a tab never reloads because of itself.
export function sessionChanged(own: string, stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.length > 0 && stored !== own;
}
