import Link from "next/link";

export type Crumb = { label: string; href?: string };

// D-44: detail screens show where they are ("Mis instituciones › <nombre>"); every part but the last is a link.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <nav aria-label="Ruta" className="text-sm text-slate-400">
    <ol className="flex flex-wrap items-center gap-1">
      {items.map((item, i) => <li key={`${item.label}-${i}`} className="flex items-center gap-1">
        {i > 0 && <span aria-hidden>›</span>}
        {item.href && i < items.length - 1 ? <Link href={item.href} className="text-sky-300 hover:underline">{item.label}</Link>
          : <span aria-current={i === items.length - 1 ? "page" : undefined} className="font-semibold text-slate-200">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}
