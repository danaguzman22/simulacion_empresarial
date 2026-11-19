# NEXUS — Instrucciones para el agente

NEXUS es una plataforma educativa de simulación empresarial. Instituciones reales (universidades, empresas) organizan materias o capacitaciones; en ellas los docentes arman campañas y partidas donde los alumnos, en equipos por departamento, gestionan una empresa simulada. Instalación, variables de entorno, migraciones y pruebas: ver `README.md`.

La dueña del proyecto es Dana. Ella decide. Hablale en español rioplatense, con explicaciones simples y concretas.

## Glosario (no mezclar estos términos)

| Término | Qué es |
| --- | --- |
| Institución | Organización real que usa NEXUS (UTN, una empresa que capacita). |
| Unidad | Nivel interno de una institución (regional, facultad, sucursal, materia). Cada institución les pone su nombre. |
| Materia | Unidad del último nivel, donde viven las campañas. |
| Empresa simulada | La empresa ficticia del juego. No es una institución. |
| Campaña / Partida | Una campaña agrupa partidas; una partida es una ejecución de la simulación con rondas. |
| Departamento | Equipo **dentro de la simulación** (Ingeniería, Finanzas). Nunca se usa para unidades de la institución. |
| Ficha | La ficha de rol de un departamento en una partida. La comparten todos sus integrantes. |

## De dónde salen las tareas y las decisiones

- Cada trabajo corresponde a una **issue de GitHub**. Si te piden algo que no tiene issue, avisá antes de empezar.
- Las decisiones de diseño tienen código (`D-xx`, `M-1`) y están en `docs/DECISIONES.md`, que es la fuente de verdad. Las issues citan los códigos y remiten a ese archivo; no copian el texto. Si algo no está decidido ahí, preguntá; no lo inventes.
- Los roles y permisos están en la sección "Roles y permisos" de `docs/DECISIONES.md`. No agregues permisos que no estén ahí.
- Si una tarea cambia una decisión, actualizá `docs/DECISIONES.md` en el mismo Pull Request, con la fecha.
- Si durante una tarea aparece una idea o mejora nueva que no bloquea el trabajo actual, se crea como issue sin sprint y se sigue con lo planeado. Solo entra al sprint actual si bloquea algo.

## Ramas y Pull Requests

- `main`: solo código probado. Nunca se trabaja directo sobre `main`.
- `develop`: integración. Las ramas de trabajo salen de acá y vuelven acá.
- Rama por issue: `feature/<número>-<descripcion-corta>` o `fix/<número>-<descripcion-corta>`. Ejemplo: `feature/12-admin-nexus`.
- Cada rama termina en un Pull Request hacia `develop`, con `Closes #<número>` en la descripción.
- `develop` pasa a `main` solo después de la prueba manual de Dana.
- Commits con prefijo: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Un commit por cambio lógico.

## Base de datos y migraciones

**Hay una sola base (Supabase). Las ramas separan el código, no la base.** Por eso:

1. Las migraciones se escriben en la rama de la issue, pero se aplican a Supabase solo cuando Dana aprueba, después de revisar el SQL.
2. Una sola migración en curso a la vez, para no chocar números.
3. Nunca edites una migración ya aplicada: cualquier corrección va en una migración nueva.
4. Cada migración que toca datos existentes lleva su `database/preflight/<número>.sql` de solo lectura.
5. Mantené sincronizados el schema de Drizzle, el SQL, el snapshot y el journal.

## Lo que nunca hacés sin que Dana lo apruebe en ese momento

- `npm run db:migrate` o cualquier escritura en Supabase.
- `git push`, merges a `develop` o `main`, borrar ramas.
- Editar `.env.local` o mostrar su contenido.
- Instalar dependencias nuevas.
- Reformatear archivos que no son parte de la tarea.

## Seguridad: revisar en cada cambio

- [ ] Los permisos se verifican en el servidor y en la base, no solo ocultando botones.
- [ ] Toda consulta nueva incluye el chequeo de institución (`institutionAccessSql` / `requireCampaignInstitution`).
- [ ] SQL siempre parametrizado. Prohibido `sql.raw` o `unsafe` con datos del usuario.
- [ ] Todo dato que llega del navegador se valida en el servidor (tipo, largo, formato).
- [ ] No se confía en ids enviados por el navegador sin verificar que pertenecen al usuario.
- [ ] Ningún dato privado (objetivo secreto, información privada, datos personales) viaja a quien no corresponde.
- [ ] Prohibido `dangerouslySetInnerHTML` con contenido de usuarios.
- [ ] Ningún secreto en el código ni en el repo.
- [ ] Las acciones de administración quedan registradas.

## Estilo de código

- Organización por funcionalidad en `apps/web/src/features/<módulo>/` con `domain`, `application`, `repositories` y `components`.
- Seguí el estilo de los archivos vecinos. No reformatees código que no tocás.
- Los textos que ve el usuario van en español.

## Al terminar una tarea

1. Corré `npm run lint`, `npm run db:check` y `npm run build` desde `apps/web`, más las pruebas relevantes de `database/tests`.
2. Reportá: qué hiciste, archivos creados y modificados, migración (si hay), pruebas y resultados, y cualquier paso manual pendiente.
3. Detenete y esperá la revisión de Dana.
