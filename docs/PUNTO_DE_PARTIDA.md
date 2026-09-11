Perfecto. Entonces ya tenemos el primer flujo real funcionando:

```text
Master autenticado
      ↓
Panel Master
      ↓
Crear empresa
      ↓
PostgreSQL
      ↓
Mis empresas
```

Antes de avanzar, haría un checkpoint en Git desde la raíz del repo:

```powershell
cd "C:\Users\Dana\OneDrive\Documentos\Facultad\Proyectos\Proyect_investigacion\simulacion_empresarial"

git status
git add apps/web database
git commit -m "feat(master): add company management"
git push origin main
```

Revisá como siempre que `.env.local` no aparezca.

Ahora vamos al siguiente flujo:

```text
Mis empresas
    ↓
Empresa ficticia 1
    ↓
/master/empresas/[id]
    ↓
Campañas
    ↓
Crear campaña
```

Y cuando una campaña sea creada, el Master que la crea va a quedar automáticamente registrado como:

```text
campaign_members
role = master
```

Esto es importante porque después podremos agregar Co-Masters.

## 1. Hacer clickeables las empresas

Reemplazá `src/features/companies/components/CompanyCard.tsx` por:

```tsx
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
      className="block"
    >
      <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]">
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

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Creada{" "}
            {createdAt.toLocaleDateString("es-AR")}
          </p>

          <span className="text-xs font-black uppercase tracking-widest text-sky-300">
            Abrir →
          </span>
        </div>
      </article>
    </Link>
  );
}
```

Y en `CompanyList.tsx`, donde llamamos a `CompanyCard`, agregá:

```tsx
id={company.id}
```

Te queda:

```tsx
<CompanyCard
  key={company.id}
  id={company.id}
  name={company.name}
  description={company.description}
  createdAt={company.createdAt}
/>
```

## 2. Creamos el módulo `campaigns`

En PowerShell, desde `apps\web`:

```powershell
New-Item -ItemType Directory -Force "src\features\campaigns\domain"
New-Item -ItemType Directory -Force "src\features\campaigns\application"
New-Item -ItemType Directory -Force "src\features\campaigns\repositories"
New-Item -ItemType Directory -Force "src\features\campaigns\components"

New-Item -ItemType Directory -Force "src\app\master\empresas\[id]"
```

## 3. Dominio de campaña

Creá:

```text
src/features/campaigns/domain/campaign.ts
```

```ts
export type CreateCampaignInput = {
  companyId: string;
  name: string;
  description: string | null;
  createdBy: string;
};

export function validateCampaignName(
  name: string
): string | null {
  const normalized =
    name.trim();

  if (!normalized) {
    return "Ingresá un nombre para la campaña.";
  }

  if (normalized.length < 2) {
    return "El nombre de la campaña es demasiado corto.";
  }

  return null;
}
```

## 4. Repository de campañas

Creá:

```text
src/features/campaigns/repositories/campaign.repository.ts
```

```ts
import "server-only";

import {
  asc,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  campaigns,
  campaignMembers,
} from "@/db/schema";

import type {
  CreateCampaignInput,
} from "../domain/campaign";

export async function createCampaign(
  input: CreateCampaignInput
) {
  return db.transaction(
    async (tx) => {
      const [campaign] =
        await tx
          .insert(campaigns)
          .values({
            companyId:
              input.companyId,

            name:
              input.name.trim(),

            description:
              input.description
                ?.trim() || null,

            createdBy:
              input.createdBy,

            status:
              "draft",
          })
          .returning();

      await tx
        .insert(campaignMembers)
        .values({
          campaignId:
            campaign.id,

          profileId:
            input.createdBy,

          role:
            "master",
        });

      return campaign;
    }
  );
}

export async function findCampaignsByCompany(
  companyId: string
) {
  return db
    .select()
    .from(campaigns)
    .where(
      eq(
        campaigns.companyId,
        companyId
      )
    )
    .orderBy(
      asc(campaigns.createdAt)
    );
}
```

Acá estamos haciendo algo importante: crear la campaña y registrar al Master ocurre dentro de **una transacción**. Si falla una de las dos cosas, no queda una campaña a medias.

## 5. Necesitamos obtener una empresa segura

En:

```text
src/features/companies/repositories/company.repository.ts
```

agregá al import de Drizzle:

```ts
and,
```

o sea:

```ts
import {
  and,
  desc,
  eq,
} from "drizzle-orm";
```

Y al final agregá:

```ts
export async function findCompanyByIdForOwner(
  companyId: string,
  profileId: string
) {
  const [company] =
    await db
      .select()
      .from(companies)
      .where(
        and(
          eq(
            companies.id,
            companyId
          ),
          eq(
            companies.createdBy,
            profileId
          )
        )
      )
      .limit(1);

  return company ?? null;
}
```

Así alguien no puede cambiar la URL manualmente y abrir una empresa ajena.

## 6. Action para crear campaña

Creá:

```text
src/features/campaigns/application/create-campaign.ts
```

```ts
"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  getAuthenticatedUserId,
} from "@/features/auth/application/get-authenticated-user-id";

import {
  findCompanyByIdForOwner,
} from "@/features/companies/repositories/company.repository";

import {
  validateCampaignName,
} from "../domain/campaign";

import {
  createCampaign,
} from "../repositories/campaign.repository";

export type CreateCampaignState = {
  error?: string;
  success?: string;
};

export async function createCampaignAction(
  _previousState: CreateCampaignState,
  formData: FormData
): Promise<CreateCampaignState> {
  const userId =
    await getAuthenticatedUserId();

  if (!userId) {
    return {
      error:
        "Tu sesión no es válida.",
    };
  }

  const companyId =
    formData.get("companyId");

  const name =
    formData.get("name");

  const description =
    formData.get("description");

  if (
    typeof companyId !== "string" ||
    typeof name !== "string"
  ) {
    return {
      error:
        "Los datos enviados no son válidos.",
    };
  }

  const company =
    await findCompanyByIdForOwner(
      companyId,
      userId
    );

  if (!company) {
    return {
      error:
        "No tenés acceso a esta empresa.",
    };
  }

  const validationError =
    validateCampaignName(name);

  if (validationError) {
    return {
      error:
        validationError,
    };
  }

  try {
    await createCampaign({
      companyId,
      name,
      description:
        typeof description ===
        "string"
          ? description
          : null,
      createdBy:
        userId,
    });

    revalidatePath(
      `/master/empresas/${companyId}`
    );

    return {
      success:
        "Campaña creada correctamente.",
    };
  } catch (error) {
    console.error(
      "Error creando campaña:",
      error
    );

    return {
      error:
        "No se pudo crear la campaña.",
    };
  }
}
```

## 7. Formulario visual

Creá:

```text
src/features/campaigns/components/CreateCampaignForm.tsx
```

```tsx
"use client";

import {
  useActionState,
} from "react";

import {
  createCampaignAction,
  type CreateCampaignState,
} from "../application/create-campaign";

const initialState:
  CreateCampaignState = {};

type Props = {
  companyId: string;
};

export function CreateCampaignForm({
  companyId,
}: Props) {
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    createCampaignAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="companyId"
        value={companyId}
      />

      <div>
        <label
          htmlFor="name"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Nombre
        </label>

        <input
          id="name"
          name="name"
          required
          placeholder="Ej: Comisión 2026"
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-sky-500"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Descripción
        </label>

        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Descripción opcional..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-sky-500"
        />
      </div>

      {state.error && (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {state.success}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-2xl bg-white px-5 py-3.5 font-black text-slate-950 disabled:opacity-50"
      >
        {pending
          ? "Creando..."
          : "Crear campaña"}
      </button>
    </form>
  );
}
```

## 8. Página de la empresa

Creá:

```text
src/app/master/empresas/[id]/page.tsx
```

```tsx
import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  getAuthenticatedUserId,
} from "@/features/auth/application/get-authenticated-user-id";

import {
  findCompanyByIdForOwner,
} from "@/features/companies/repositories/company.repository";

import {
  findCampaignsByCompany,
} from "@/features/campaigns/repositories/campaign.repository";

import {
  CreateCampaignForm,
} from "@/features/campaigns/components/CreateCampaignForm";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CompanyPage({
  params,
}: Props) {
  const userId =
    await getAuthenticatedUserId();

  if (!userId) {
    redirect("/login/master");
  }

  const { id } =
    await params;

  const company =
    await findCompanyByIdForOwner(
      id,
      userId
    );

  if (!company) {
    notFound();
  }

  const campaigns =
    await findCampaignsByCompany(
      company.id
    );

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        <Link
          href="/master"
          className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white"
        >
          ← Panel Master
        </Link>

        <header className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-400">
            Empresa
          </p>

          <h1 className="mt-3 text-4xl font-black">
            {company.name}
          </h1>

          {company.description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {company.description}
            </p>
          )}
        </header>

        <section className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">

          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            <p className="text-xs font-black uppercase tracking-widest text-sky-400">
              Nueva
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Crear campaña
            </h2>

            <div className="mt-6">
              <CreateCampaignForm
                companyId={company.id}
              />
            </div>
          </div>

          <div>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-sky-400">
                  Historial
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Campañas
                </h2>
              </div>

              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400">
                {campaigns.length}
              </span>
            </div>

            {campaigns.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
                Esta empresa todavía no tiene campañas.
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map(
                  (campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"
                    >
                      <p className="text-xs font-black uppercase tracking-widest text-sky-400">
                        {campaign.status}
                      </p>

                      <h3 className="mt-2 text-xl font-black">
                        {campaign.name}
                      </h3>

                      {campaign.description && (
                        <p className="mt-2 text-sm text-slate-400">
                          {campaign.description}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

        </section>
      </div>
    </main>
  );
}
```

Después:

```powershell
npm run build
```

y si está bien:

```powershell
npm run dev
```

Ahora el flujo debería ser:

```text
/master
↓
tocás Empresa ficticia 1
↓
/master/empresas/UUID
↓
Crear campaña
↓
"Comisión 2026"
↓
aparece en Campañas
```

Y si funciona, el próximo paso es el que empieza a unir todo lo que veníamos imaginando: **entrar a una campaña y crear sus Partidas + Sala**, generando un código corto para conectar Master, Display y después jugadores.
