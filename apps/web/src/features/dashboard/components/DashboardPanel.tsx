import type { ReactNode } from "react";

// Glass panel from the dashboard prototype; shared by every dashboard block (KPIs, goals, wall, charts).
export function DashboardPanel({ title, eyebrow, children, className = "" }: { title: string; eyebrow?: string; children?: ReactNode; className?: string }) {
  return <section aria-label={title} className={`rounded-2xl border border-white/70 bg-white/[0.76] p-5 text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl ${className}`}>
    {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{eyebrow}</p>}
    <h2 className="text-lg font-extrabold text-[#0b3159]">{title}</h2>
    {children}
  </section>;
}

// Reserved place for a block that a later issue fills in.
export function DashboardPlaceholder({ title, eyebrow, issue, className }: { title: string; eyebrow?: string; issue: string; className?: string }) {
  return <DashboardPanel title={title} eyebrow={eyebrow} className={className}>
    <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Próximamente ({issue}).</p>
  </DashboardPanel>;
}
