"use client";
import { useEffect, useRef, useState } from "react";
import { getRounds } from "../application/round-actions";
import { remainingMilliseconds, roundLabels } from "../domain/round";
import { Action, type RoundsData } from "./RoundsPanel";

const format = (ms: number) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

// Header view of the running period: same clock math and the same pause/resume buttons as the Control tab.
// The browser only counts down from the server time; every action is validated again on the server.
export function CurrentPeriodBar({ gameId, initial }: { gameId: string; initial: RoundsData }) {
  const [data, setData] = useState(initial), [now, setNow] = useState(Date.parse(initial.serverNow));
  const clock = useRef({ server: Date.parse(initial.serverNow), client: 0 });
  useEffect(() => {
    let stopped = false, busy = false;
    clock.current.client = performance.now();
    const refresh = async () => {
      if (busy) return; busy = true; const sent = performance.now();
      try { const next = await getRounds(gameId); if (!stopped) { const received = performance.now(); clock.current = { server: Date.parse(next.serverNow) + (received - sent) / 2, client: received }; setNow(clock.current.server); setData(next); } }
      catch { /* keeps counting from the last server data */ } finally { busy = false; }
    };
    const poll = setInterval(() => { void refresh(); }, 5000), tick = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.client), 1000);
    return () => { stopped = true; clearInterval(poll); clearInterval(tick); };
  }, [gameId]);
  const round = data.rounds.find(r => r.status === "active" || r.status === "paused");
  if (!round) return <p className="mt-4 text-sm text-slate-400">Ningún período en curso.</p>;
  const remaining = remainingMilliseconds(round, now), expired = round.status === "active" && remaining <= 0;
  return <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3" aria-label="Período en curso">
    <p className="font-bold">{data.periodLabel} {round.sequence}</p>
    <p className="font-mono text-3xl tabular-nums" role="timer" aria-label="Tiempo restante del período">{format(remaining)}</p>
    <p className="text-sm text-slate-400">{expired ? "Finalizada (sincronizando)" : roundLabels[round.status]}</p>
    {data.canManage && !expired && <div key={round.revision} className="[&_form]:mt-0">
      {round.status === "active" && <Action gameId={gameId} round={round} operation="pause" label="Pausar" />}
      {round.status === "paused" && <Action gameId={gameId} round={round} operation="resume" label="Reanudar" />}
    </div>}
  </div>;
}
