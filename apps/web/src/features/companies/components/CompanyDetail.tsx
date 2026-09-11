import Link from "next/link";
import type { ReactNode } from "react";

type CompanyDetailProps = {
  children?: ReactNode;
  company: {
    name: string;
    description: string | null;
    createdAt: Date;
  };
};

export function CompanyDetail({
  company,
  children,
}: CompanyDetailProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/master"
          className="rounded text-xs font-black uppercase tracking-widest text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
        >
          ← Panel Master
        </Link>

        <article className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
          <header>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-400">
              Empresa
            </p>
            <h1 className="mt-3 break-words text-4xl font-black tracking-tight">
              {company.name}
            </h1>
          </header>

          {company.description && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
              {company.description}
            </p>
          )}

          <p className="mt-6 text-xs font-bold text-slate-400">
            Creada{" "}
            <time dateTime={company.createdAt.toISOString()}>
              {company.createdAt.toLocaleDateString("es-AR")}
            </time>
          </p>
        </article>
        {children}
      </div>
    </main>
  );
}
