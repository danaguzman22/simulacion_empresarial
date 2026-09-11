import Link from "next/link";

type CompanyCardProps = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export function CompanyCard({
  id,
  name,
  description,
  createdAt,
}: CompanyCardProps) {

  return (
    <Link
      href={`/master/empresas/${id}`}
      className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
    >
    <article className="h-full rounded-3xl border border-white/10 bg-white/[0.05] p-5 transition hover:border-white/20 hover:bg-white/[0.07]">

      <div className="flex items-start justify-between gap-4">

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">
            Empresa
          </p>

          <h3 className="mt-2 text-xl font-black text-white">
            {name}
          </h3>
        </div>

        <div className="text-2xl">
          🏢
        </div>

      </div>

      {description && (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {description}
        </p>
      )}

      <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        Creada{" "}
        {createdAt.toLocaleDateString(
          "es-AR"
        )}
      </p>

      <span className="mt-4 block text-xs font-black uppercase tracking-widest text-sky-300">
        Abrir →
      </span>
    </article>
    </Link>
  );
}
