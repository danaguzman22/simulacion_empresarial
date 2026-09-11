import {
  CompanyCard,
} from "./CompanyCard";

type Company = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

type CompanyListProps = {
  companies: Company[];
};

export function CompanyList({
  companies,
}: CompanyListProps) {

  if (
    companies.length === 0
  ) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">

        <div className="text-4xl">
          🏢
        </div>

        <h3 className="mt-4 text-lg font-black text-white">
          Todavía no hay empresas
        </h3>

        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Creá la primera empresa ficticia
          para comenzar una simulación.
        </p>

      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">

      {companies.map(
        (company) => (
          <CompanyCard
            key={company.id}
            name={company.name}
            description={
              company.description
            }
            createdAt={
              company.createdAt
            }
          />
        )
      )}

    </div>
  );
}