# simulacion_empresarial

Plataforma de simulación empresarial. Un Master prepara empresas, campañas y partidas, con KPIs, rondas, situaciones, reglas y fichas de rol, y los alumnos participan con la ficha que se les asigna dentro de su institución.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `apps/web` | Aplicación Next.js (App Router), Drizzle ORM y Supabase Auth |
| `apps/web/src/features/*` | Módulos por funcionalidad: `domain`, `application`, `repositories`, `components` |
| `apps/web/src/db/schema` | Schema de Drizzle |
| `database/migrations` | Migraciones SQL generadas y revisadas, con su `meta/_journal.json` |
| `database/preflight` | Consultas **de solo lectura** para correr antes de aplicar una migración |
| `database/admin` | Procedimientos manuales de operador (no son migraciones) |
| `database/tests` | Pruebas unitarias e integración |
| `docs` | Notas de diseño por entrega (`ALUMNOS_0029.md`, `INSTITUCIONES_0030.md`, …) |

## Requisitos

- Node.js 20 o superior (desarrollado con Node 24)
- Un proyecto de Supabase (Auth + PostgreSQL)
- Para las pruebas de integración: PostgreSQL local

## Instalación

```bash
cd apps/web
npm install
```

Creá `apps/web/.env.local` (está ignorado por git; nunca lo commitees) con las variables de la sección siguiente, y después:

```bash
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Variables de entorno

Todas van en `apps/web/.env.local`.

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase (cliente y servidor) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase para Auth |
| `DATABASE_URL` | Conexión PostgreSQL que usa la app en tiempo de ejecución (pooler en modo transacción) |
| `DATABASE_MIGRATION_URL` | Conexión PostgreSQL que usa `drizzle-kit` para migrar (modo sesión) |
| `PREPARATION_TEST_URL` | Solo para pruebas de integración; ver más abajo. Se pasa por la línea de comandos, no va en `.env.local` |

Los connection strings se copian del panel de Supabase (**Connect**). Si el pooler responde `tenant/user ... not found`, revisá que el host y la región coincidan con los que muestra el panel.

La app se conecta directamente a PostgreSQL. La autorización la hacen el código de la app y los triggers de la base, no RLS por usuario. Toda consulta nueva debe incluir el chequeo de institución (`institutionAccessSql` / `requireCampaignInstitution`).

## Supabase local (Docker)

Para desarrollar sin depender de la base en la nube (D-14). Todo corre en tu PC: Auth, PostgreSQL 17, Studio y un buzón de correos de prueba. `.env.local` no se usa ni se modifica: los scripts le pasan a la app las URLs y claves locales.

Requisitos: Docker Desktop abierto y las dependencias instaladas (`npm install` en `apps/web`, que incluye la Supabase CLI).

```bash
cd apps/web
npm run local:start                 # levanta Supabase y aplica las migraciones de Drizzle
npm run local:dev                   # app en http://localhost:3100 contra la base local
npm run local:admin -- tu@correo    # después de registrarte: te hace admin de una institución de prueba
npm run local:stop                  # apaga los contenedores; los datos quedan para la próxima
```

- Studio (ver y editar datos): http://127.0.0.1:54323
- Correos de prueba: http://127.0.0.1:54324. En local no hace falta confirmar el correo para entrar.
- Si agregás una migración nueva: `npm run local:migrate`.
- Los scripts se detienen si la base o la API no están en `127.0.0.1`.
- `npm run dev` sigue apuntando a Supabase en la nube, como siempre.

## Migraciones

Desde `apps/web`:

```bash
npm run db:generate   # genera una migración nueva a partir del schema
npm run db:check      # valida la coherencia de migraciones y snapshots
npm run db:migrate    # aplica las migraciones pendientes en DATABASE_MIGRATION_URL
```

Reglas del proyecto:

1. **Revisá el SQL generado** antes de aplicarlo. Muchas migraciones tienen funciones y triggers escritos a mano.
2. Si existe `database/preflight/<número>.sql`, corrélo antes en el SQL Editor. Es de solo lectura y sirve para detectar datos que la migración no debe tocar.
3. **No edites una migración ya aplicada.** Drizzle registra en `drizzle.__drizzle_migrations` el SHA-256 del archivo y no la vuelve a ejecutar. Cualquier corrección va en una migración nueva.
4. Los `.sql` se guardan con fin de línea LF (`.gitattributes`). Cambiar los fines de línea cambia el hash del archivo.

## Pruebas

En cada Pull Request hacia `develop` o `main`, GitHub Actions (`.github/workflows/ci.yml`) corre lint, `db:check`, build, las pruebas unitarias y todas las de integración contra un PostgreSQL 17 descartable. No usa secretos ni toca Supabase. El resultado aparece en la pestaña **Checks** del PR. Para correrlas en tu máquina:

### Unitarias (sin base de datos)

Desde la raíz del repo, después de `npm install` en `apps/web`:

```bash
node database/tests/goal-form.test.cjs
node database/tests/preparation-form.test.cjs
node database/tests/rule-form.test.cjs
node database/tests/situation-form.test.cjs
node database/tests/source-kpi-form.test.cjs
node database/tests/game-lifecycle-actions.test.cjs
node database/tests/student-auth.test.cjs
```

### Integración (PostgreSQL local)

Cada suite `*.integration.cjs` aplica todas las migraciones sobre una base vacía y le carga datos de prueba. Por seguridad, solo acepta una URL con host `127.0.0.1` y una base cuyo nombre empiece con `preparation_`. Nunca usa las credenciales de la app.

1. Creá los roles que esperan las migraciones (una sola vez por servidor):

   ```sql
   CREATE ROLE anon NOLOGIN;
   CREATE ROLE authenticated NOLOGIN;
   CREATE ROLE service_role NOLOGIN;
   ```

2. Creá una base **nueva y vacía** para cada corrida (la suite crea el schema `auth` y falla si ya existe):

   ```bash
   createdb -h 127.0.0.1 preparation_secrets
   ```

3. Corré la suite:

   ```bash
   PREPARATION_TEST_URL="postgresql://<usuario>@127.0.0.1:5432/preparation_secrets" \
     node database/tests/card-secrets.integration.cjs
   ```

   En PowerShell:

   ```powershell
   $env:PREPARATION_TEST_URL = "postgresql://<usuario>@127.0.0.1:5432/preparation_secrets"
   node database/tests/card-secrets.integration.cjs
   ```

4. Borrá la base al terminar (`dropdb -h 127.0.0.1 preparation_secrets`) y creá otra para la siguiente suite.

Suites disponibles: `card-secrets`, `flexible-kpis`, `game-inheritance`, `game-kpis`, `game-lifecycle-legacy`, `game-rules`, `goals`, `institutions`, `preparation`, `records`, `role-cards`, `rounds`, `situations`, `start-game`, `students`.
