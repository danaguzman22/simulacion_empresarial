import type { ReactNode } from "react";
import { SectionTabs, type SectionTab } from "./SectionTabs";

// D-44: every area of the app has the same pattern: a title, a menu of sections (tabs) and one section per screen,
// never everything stacked. Used by the area layouts; each page renders only its own section.
export function AreaShell({ title, description, tabsLabel, tabs, children }: { title: string; description?: string; tabsLabel: string; tabs: SectionTab[]; children: ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl">
    <h1 className="text-3xl font-black">{title}</h1>
    {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
    <SectionTabs label={tabsLabel} tabs={tabs} />
    <div className="mt-6">{children}</div>
  </div></main>;
}
