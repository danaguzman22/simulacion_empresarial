import Link from "next/link";

// Empty searches and lists say what is missing and what to do next, never just "nothing here".
// For a search: title "No encontramos … que coincidan con «texto»" and a hint with the next step.
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm">
    <p className="font-semibold text-slate-200">{title}</p>
    {(hint || action) && <p className="mt-1 text-slate-400">{hint}{hint && action ? " " : ""}{action && <Link href={action.href} className="text-sky-300 hover:underline">{action.label}</Link>}</p>}
  </div>;
}
