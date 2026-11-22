"use client";
import { useEffect } from "react";
import { SESSION_STORAGE_KEY, sessionChanged } from "../domain/session-watch";

// #72: when the session changes in another tab (sign-out, or sign-in as someone else), the open tabs reload with
// the new person. Each page writes an opaque key of its session (a hash, never the id, name or e-mail) to
// localStorage; the other tabs get the "storage" event, and a hidden tab also compares when it is shown again.
// After the reload the tab writes the same key as the others, so it never loops. Mounted once in the root layout.
export function SessionWatch({ sessionKey }: { sessionKey: string }) {
  useEffect(() => {
    try { window.localStorage.setItem(SESSION_STORAGE_KEY, sessionKey); } catch { /* no storage: nothing to compare */ }
    const read = () => { try { return window.localStorage.getItem(SESSION_STORAGE_KEY); } catch { return null; } };
    const onStorage = (event: StorageEvent) => { if (event.key === SESSION_STORAGE_KEY && sessionChanged(sessionKey, event.newValue)) window.location.reload(); };
    const onVisible = () => { if (document.visibilityState === "visible" && sessionChanged(sessionKey, read())) window.location.reload(); };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onVisible); };
  }, [sessionKey]);
  return null;
}
