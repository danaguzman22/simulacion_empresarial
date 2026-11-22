// #85: an open window that still runs an older version of the app (after a restart or a deploy) calls server
// actions that no longer exist. Pure decision (no browser), covered by unit tests: reload the page by itself,
// at most once per cooldown so it never loops, and never while someone has unsent text on the page.

// At most one automatic reload per window in this time. If the new version is still not served after it
// (for example, the server was restarting), the next failed refresh after the cooldown tries again.
export const STALE_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;
export const STALE_RELOAD_STORAGE_KEY = "nexus-stale-reload-at";

export type StaleRecovery = "reload" | "ask";

export function decideStaleRecovery(input: { now: number; lastReloadAt: number | null; hasDraft: boolean }): StaleRecovery {
  // Unsent text would be lost: ask the person instead.
  if (input.hasDraft) return "ask";
  // A recent automatic reload did not fix it: do not reload again until the cooldown ends.
  if (input.lastReloadAt !== null && input.now >= input.lastReloadAt && input.now - input.lastReloadAt < STALE_RELOAD_COOLDOWN_MS) return "ask";
  return "reload";
}

// Reads the stored time of the last automatic reload; anything unreadable counts as "never".
export function parseLastReload(raw: string | null): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

// Only fields where a person types text count as a draft; filters (select, checkbox) do not.
const textInputTypes = new Set(["", "text", "search", "email", "url", "tel", "number", "password", "date", "datetime-local", "time"]);
export function isDraftField(field: { tagName: string; type?: string; isContentEditable?: boolean }): boolean {
  const tag = field.tagName.toUpperCase();
  if (tag === "TEXTAREA" || field.isContentEditable) return true;
  return tag === "INPUT" && textInputTypes.has((field.type ?? "").toLowerCase());
}
