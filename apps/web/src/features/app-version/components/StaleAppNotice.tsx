"use client";
import { useEffect, useState } from "react";
import { STALE_APP_EVENT, trackDrafts } from "./stale-app";

// #85: shown when the window runs an older version of the app and could not reload by itself
// (unsent text on the page, or it already reloaded a moment ago). Mounted once in the root layout.
export function StaleAppNotice() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const untrack = trackDrafts();
    const show = () => setVisible(true);
    window.addEventListener(STALE_APP_EVENT, show);
    return () => { untrack(); window.removeEventListener(STALE_APP_EVENT, show); };
  }, []);
  if (!visible) return null;
  return <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950 shadow-lg">
    <p className="min-w-0 flex-1">Hay una versión nueva de NEXUS. Si estabas escribiendo algo, copialo antes de recargar: esta ventana ya no puede guardarlo.</p>
    <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-amber-900 px-3 py-1.5 font-bold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900">Recargar</button>
  </div>;
}
