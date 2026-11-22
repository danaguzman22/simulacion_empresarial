"use client";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { decideStaleRecovery, isDraftField, parseLastReload, STALE_RELOAD_STORAGE_KEY } from "../domain/stale-version";

// #85: the single recovery shared by every screen that refreshes itself (dashboard, projection, header bar,
// Control, Mi ficha). Each one calls recoverIfStaleApp in the catch of its automatic refresh.
export const STALE_APP_EVENT = "nexus:stale-app";

// Text typed and not sent yet (reset when a form is submitted).
let draft = false;
export function trackDrafts() {
  const typed = (event: Event) => { const target = event.target as HTMLElement | null; if (target && isDraftField(target as HTMLInputElement)) draft = true; };
  const sent = () => { draft = false; };
  document.addEventListener("input", typed, true);
  document.addEventListener("submit", sent, true);
  return () => { document.removeEventListener("input", typed, true); document.removeEventListener("submit", sent, true); };
}

function hasDraft() {
  const active = document.activeElement as HTMLElement | null;
  return draft || (!!active && isDraftField(active as HTMLInputElement));
}

function readLastReload() {
  try { return parseLastReload(window.sessionStorage.getItem(STALE_RELOAD_STORAGE_KEY)); } catch { return null; }
}

// Returns true when the error means "this window runs an old version": then it reloads the page (once per
// cooldown) or, if that is not safe, shows the shared notice. Any other error returns false.
export function recoverIfStaleApp(error: unknown): boolean {
  if (!unstable_isUnrecognizedActionError(error)) return false;
  const now = Date.now();
  if (decideStaleRecovery({ now, lastReloadAt: readLastReload(), hasDraft: hasDraft() }) === "reload") {
    try { window.sessionStorage.setItem(STALE_RELOAD_STORAGE_KEY, String(now)); } catch { /* without storage the cooldown cannot be kept: ask instead */
      window.dispatchEvent(new Event(STALE_APP_EVENT)); return true; }
    window.location.reload();
  } else {
    window.dispatchEvent(new Event(STALE_APP_EVENT));
  }
  return true;
}
