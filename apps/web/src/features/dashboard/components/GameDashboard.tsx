"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MonitorUp } from "lucide-react";
import { gameStatusLabels } from "@/features/games/domain/game";
import { recoverIfStaleApp } from "@/features/app-version/components/stale-app";
import { getDashboard } from "../application/dashboard-actions";
import { canProjectDashboard, DASHBOARD_REFRESH_MS, gameChannelName } from "../domain/dashboard";
import type { DashboardData } from "../repositories/dashboard.repository";
import { DashboardClock } from "./DashboardClock";
import { DashboardPanel } from "./DashboardPanel";
import { KpiCard } from "./KpiCard";
import { KpiEvolution } from "./KpiEvolution";
import { GoalsPanel } from "./GoalsPanel";
import { NoticeWall } from "./NoticeWall";

// The single game dashboard (#32): the Master's tab, the participant's tab and the projection window render it.
// It refreshes itself from the server; the browser clock only measures elapsed time since the last server time.
export function GameDashboard({ initial, mode }: { initial: DashboardData; mode: "embedded" | "projection" }) {
  const [data, setData] = useState(initial), [now, setNow] = useState(Date.parse(initial.serverNow)), [offline, setOffline] = useState(false);
  const clock = useRef({ server: Date.parse(initial.serverNow), client: 0 });
  useEffect(() => {
    let stopped = false, busy = false;
    clock.current.client = performance.now();
    const refresh = async () => {
      if (busy) return; busy = true; const sent = performance.now();
      try {
        const next = await getDashboard(initial.game.id);
        if (stopped) return;
        if (!next) { setOffline(true); return; }
        const received = performance.now();
        clock.current = { server: Date.parse(next.serverNow) + (received - sent) / 2, client: received };
        setData(next); setNow(clock.current.server); setOffline(false);
      } catch (error) { if (!stopped && !recoverIfStaleApp(error)) setOffline(true); } finally { busy = false; }
    };
    const poll = setInterval(() => { void refresh(); }, DASHBOARD_REFRESH_MS);
    const tick = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.client), 1000);
    // Browsers slow down timers in windows that are not visible (a projection behind the Master's window).
    // So refresh as soon as the window is seen again, and when another window of this game changes a period.
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(gameChannelName(initial.game.id));
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => { stopped = true; clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); channel?.close(); };
  }, [initial.game.id]);

  const project = () => window.open(`/proyectar/partidas/${data.game.id}`, `nexus-proyeccion-${data.game.id}`, "popup");
  const projection = mode === "projection";
  return <div className={`relative isolate overflow-hidden ${projection ? "min-h-screen" : "mt-8 rounded-3xl"}`}>
    <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/dashboard/fondo.webp')" }} />
    <div className={`space-y-4 ${projection ? "px-5 py-4 2xl:px-8 2xl:py-6" : "p-4 md:p-5"}`}>
      <header className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-white/70 bg-white/[0.76] px-6 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-6">
          <Image src="/dashboard/logo.webp" alt="NEXUS · Tablero de simulación" width={1200} height={405} priority className="h-auto w-[170px] object-contain lg:w-[220px]" />
          <div className="hidden h-14 w-px bg-slate-400/40 sm:block" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{data.game.campaignName}</p>
            <p className="truncate text-2xl font-extrabold text-[#0b3159]">{data.game.name}</p>
            <p className="text-xs font-semibold text-slate-500">{gameStatusLabels[data.game.status]}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <DashboardClock data={data} now={now} />
          {!projection && canProjectDashboard(data.viewer) && <button type="button" onClick={project}
            className="flex items-center gap-2 rounded-xl bg-[#0b3159] px-4 py-2 text-sm font-bold text-white hover:bg-[#0b3159]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            <MonitorUp aria-hidden className="h-4 w-4" />Proyectar</button>}
        </div>
      </header>
      {offline && <p role="status" className="rounded-xl bg-amber-100/90 px-4 py-2 text-sm font-semibold text-amber-900">Sin conexión con el servidor: se muestran los últimos datos recibidos.</p>}
      {data.kpis.length
        ? <section aria-label="KPIs de la partida" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}</section>
        : <DashboardPanel eyebrow="Indicadores" title="KPIs de la partida"><p className="mt-3 text-sm text-slate-500">La partida todavía no tiene KPIs en juego.</p></DashboardPanel>}
      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardPanel eyebrow="Evolución" title="Evolución de los indicadores" className="lg:col-span-2"><KpiEvolution kpis={data.kpis} /></DashboardPanel>
        <GoalsPanel board={data.goals} />
      </div>
      <NoticeWall items={data.wall} />
    </div>
  </div>;
}
