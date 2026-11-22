import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

// D-44: a detail screen: the route on top, then its title and content (no section tabs).
export function DetailShell({ crumbs, title, subtitle, children }: { crumbs: Crumb[]; title: string; subtitle?: string; children: ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl">
    <Breadcrumbs items={crumbs} />
    <h1 className="mt-4 text-3xl font-black">{title}</h1>
    {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    <div className="mt-6">{children}</div>
  </div></main>;
}
