import Link from "next/link";

export type Crumb = { label: string; href?: string };

// The visible "← Volver a <anterior>" of a detail screen: the last part of the route, before the current one, that
// has a link (a part without access, like a company the person cannot open, is skipped). Null when there is none.
export function backCrumb(items: Crumb[]): Required<Crumb> | null {
  for (let i = items.length - 2; i >= 0; i--) {
    const item = items[i];
    if (item.href) return { label: item.label, href: item.href };
  }
  return null;
}

export const backButtonClass = "inline-flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400";

// D-44 / #100: detail screens show where they are ("Mis instituciones › <nombre>"); every part but the last is a
// link, and below the route a visible "← Volver a <anterior>". Every detail screen gets it from here, never its own.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const back = backCrumb(items);
  return <div className="space-y-3">
    <nav aria-label="Ruta" className="text-sm text-slate-400">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => <li key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          {item.href && i < items.length - 1 ? <Link href={item.href} className="text-sky-300 hover:underline">{item.label}</Link>
            : <span aria-current={i === items.length - 1 ? "page" : undefined} className="font-semibold text-slate-200">{item.label}</span>}
        </li>)}
      </ol>
    </nav>
    {back && <Link href={back.href} className={backButtonClass}>← Volver a {back.label}</Link>}
  </div>;
}
