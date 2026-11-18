"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { remainingMilliseconds } from "@/features/rounds/domain/round";
import { shouldRefreshOnExpiry } from "../domain/clock";
import type { readAssignedCard } from "../repositories/student.repository";
type Clock = NonNullable<Awaited<ReturnType<typeof readAssignedCard>>>["clock"];
function format(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
// Display only: the countdown starts from the server time and end time, and measures elapsed time with
// performance.now(), so the browser's own clock never decides anything. Each server refresh restarts
// the count from fresh data without remounting, so the component remembers which expiry it refreshed for.
export function StudentClock({ clock, gameActive }: { clock: Clock; gameActive: boolean }) {
  const router = useRouter();
  const server = Date.parse(clock.serverNow);
  const [time, setTime] = useState({ server, now: server });
  if (time.server !== server) setTime({ server, now: server });
  const refreshedEndsAt = useRef<string | null>(null);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setTime({ server, now: server + performance.now() - start }), 250);
    return () => window.clearInterval(timer);
  }, [server]);
  const period = clock.period;
  const now = time.server === server ? time.now : server;
  useEffect(() => {
    if (!shouldRefreshOnExpiry(period, now, refreshedEndsAt.current)) return;
    refreshedEndsAt.current = period?.endsAt ?? null;
    router.refresh();
  }, [period, now, router]);
  if (!period) return gameActive ? <p className="mt-4 text-slate-400">Ningún período en curso.</p> : null;
  const remaining = remainingMilliseconds(period, now);
  const expired = period.status === "active" && remaining <= 0;
  return <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-6" aria-labelledby="student-clock-title">
    <h2 id="student-clock-title" className="font-bold">{period.label}{period.name ? ` · ${period.name}` : ""}</h2>
    <p role="timer" aria-label="Tiempo restante del período" className="my-2 font-mono text-4xl tabular-nums">{format(remaining)}</p>
    <p className="text-sm text-slate-400">{expired ? "Tiempo cumplido. El período se cerrará en breve." : period.status === "paused" ? "En pausa." : "En curso."}</p>
  </section>;
}
