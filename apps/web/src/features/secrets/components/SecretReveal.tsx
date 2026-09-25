"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestSecret } from "../application/reveal-actions";
import type { RevealSummary } from "../domain/reveal";

export function SecretReveal({ gameId, summary }: { gameId: string; summary: RevealSummary }) {
  const router = useRouter();
  const [windowState, setWindowState] = useState<{ text: string; deadline: number } | null>(null);
  const [remaining, setRemaining] = useState(0), [busy, setBusy] = useState(false), [holding, setHolding] = useState(false), [message, setMessage] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null), requestVersion = useRef(0), pendingKey = useRef<string | null>(null), mounted = useRef(true), inFlight = useRef(false);
  const invalidate = useCallback(() => { ++requestVersion.current; }, []);
  const cancelHold = useCallback(() => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; setHolding(false); }, []);
  const load = useCallback(async (consume: boolean) => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    inFlight.current = true; setBusy(true);
    const version = ++requestVersion.current, sent = performance.now();
    if (consume && !pendingKey.current) pendingKey.current = crypto.randomUUID();
    try {
      const result = await requestSecret(gameId, consume ? pendingKey.current : null);
      if (!mounted.current || version !== requestVersion.current || document.visibilityState !== "visible") return;
      if (result.status === "revealed") {
        pendingKey.current = null;
        // Conservatively subtract the full request duration: a slow response
        // cannot grant extra visible time beyond the server's authorization.
        const ms = Math.max(0, result.remainingMs - (performance.now() - sent));
        setWindowState(ms > 0 ? { text: result.text, deadline: performance.now() + ms } : null); setRemaining(Math.ceil(ms / 1000)); setMessage("");
      } else {
        setWindowState(null);
        if (consume) {
          pendingKey.current = null;
          const messages = { closed: "La partida debe estar activa y sin un cierre de período pendiente.", expired: "La ventana de revelación ya venció.", exhausted: "Ya se utilizaron todas las revelaciones de este departamento.", "already-open": "Ya tenés una ventana abierta. Recargá para recuperar el tiempo restante.", unconfigured: "El objetivo secreto o sus revelaciones no están configurados." };
          setMessage(result.status === "error" ? result.message : messages[result.status]);
        }
      }
      if (consume) router.refresh();
    } catch { if (mounted.current) setMessage("No se pudo confirmar la respuesta. Reintentá: se conservará la misma operación."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [gameId, router]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { cancelHold(); setWindowState(null); invalidate(); if (summary.enabled && document.visibilityState === "visible") void load(false); };
    // Recovery is a separate authorized request, never part of initial HTML.
    const startup = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { mounted.current = false; invalidate(); clearTimeout(startup); if (holdTimer.current) clearTimeout(holdTimer.current); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, cancelHold, invalidate, summary.enabled]);
  useEffect(() => {
    if (!windowState) return;
    const tick = () => { const ms = windowState.deadline - performance.now(); setRemaining(Math.max(0, Math.ceil(ms / 1000))); if (ms <= 0) setWindowState(null); };
    const timer = setInterval(tick, 100), end = setTimeout(() => setWindowState(null), Math.max(0, windowState.deadline - performance.now()));
    return () => { clearInterval(timer); clearTimeout(end); };
  }, [windowState]);
  const left = Math.max(0, summary.limit - summary.used), disabled = busy || Boolean(windowState) || !summary.enabled || !summary.configured || left === 0;
  const beginHold = () => { if (disabled || holdTimer.current) return; setHolding(true); holdTimer.current = setTimeout(() => { holdTimer.current = null; setHolding(false); void load(true); }, 650); };
  return <section className="mt-6 rounded-xl border border-amber-500/30 p-4"><h2 className="font-bold">Objetivo secreto</h2>
    <p className="mt-2 text-sm">Revelaciones disponibles: {left} de {summary.limit}. Cupo compartido por el departamento.</p>
    {!summary.configured && <p className="mt-2 text-sm text-slate-400">Sin configurar para esta partida.</p>}
    {windowState && summary.enabled ? <div className="mt-3 rounded bg-amber-500/10 p-4"><p className="whitespace-pre-wrap">{windowState.text}</p><p className="mt-2 font-bold">Se oculta en {remaining} s</p></div> : <button type="button" disabled={disabled} className="mt-3 touch-none select-none rounded bg-amber-700 px-4 py-3 disabled:opacity-50"
      onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); beginHold(); } }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onLostPointerCapture={cancelHold} onBlur={cancelHold}
      onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); beginHold(); } }} onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); cancelHold(); } }} onContextMenu={e => e.preventDefault()}>
      {holding ? "Mantené presionado…" : "Mantener presionado para revelar"}
    </button>}
    {summary.configured && left === 0 && <p className="mt-2 text-sm">Ya se utilizaron todas las revelaciones de este departamento.</p>}
    <p role="status" className="mt-2 text-sm text-slate-300">{message}</p>
  </section>;
}
