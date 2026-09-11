type CompanyCardProps = {
  name: string;
  description: string | null;
  createdAt: Date;
};

export function CompanyCard({
  name,
  description,
  createdAt,
}: CompanyCardProps) {

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 transition hover:border-white/20 hover:bg-white/[0.07]">

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

    </article>
  );
}