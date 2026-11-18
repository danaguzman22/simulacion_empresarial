"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { remainingMilliseconds } from "@/features/rounds/domain/round";
import type { readAssignedCard } from "../repositories/student.repository";
type Clock = NonNullable<Awaited<ReturnType<typeof readAssignedCard>>>["clock"];
function format(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
// Display only: the countdown starts from the server time and end time, and measures elapsed time with
// performance.now(), so the browser's own clock never decides anything. The parent keys it by serverNow,
// so each server refresh restarts the count from fresh data.
export function StudentClock({ clock, gameActive }: { clock: Clock; gameActive: boolean }) {
  const router = useRouter();
  const server = Date.parse(clock.serverNow);
  const [now, setNow] = useState(server);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setNow(server + performance.now() - start), 250);
    return () => window.clearInterval(timer);
  }, [server]);
  const period = clock.period;
  const remaining = period ? remainingMilliseconds(period, now) : 0;
  const expired = period?.status === "active" && remaining <= 0;
  // Once at zero, ask the server for the real state instead of waiting for the next periodic refresh.
  useEffect(() => { if (expired) router.refresh(); }, [expired, router]);
  if (!period) return gameActive ? <p className="mt-4 text-slate-400">Ningún período en curso.</p> : null;
  return <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-6" aria-labelledby="student-clock-title">
    <h2 id="student-clock-title" className="font-bold">{period.label}{period.name ? ` · ${period.name}` : ""}</h2>
    <p role="timer" aria-label="Tiempo restante del período" className="my-2 font-mono text-4xl tabular-nums">{format(remaining)}</p>
    <p className="text-sm text-slate-400">{expired ? "Tiempo cumplido. El período se cerrará en breve." : period.status === "paused" ? "En pausa." : "En curso."}</p>
  </section>;
}
