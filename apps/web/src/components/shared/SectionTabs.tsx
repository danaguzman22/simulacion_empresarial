"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SectionTab = { href: string; label: string; badge?: number };

// D-44: the section menu every area uses (same look as the game tabs). One section per screen.
export function SectionTabs({ label, tabs }: { label: string; tabs: SectionTab[] }) {
  const pathname = usePathname();
  return <nav aria-label={label} className="mt-6 overflow-x-auto">
    <ul className="flex min-w-max gap-2 border-b border-white/10 pb-2">
      {tabs.map(tab => {
        const active = pathname === tab.href;
        return <li key={tab.href}>
          <Link href={tab.href} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${active ? "bg-sky-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
            {tab.label}
            {tab.badge ? <span className={`rounded-full px-2 text-xs ${active ? "bg-slate-950 text-sky-200" : "bg-amber-400 text-slate-950"}`}>{tab.badge}</span> : null}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
