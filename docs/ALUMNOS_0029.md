# Alumnos y fichas compartidas — 0029

## Alcance

Supabase Auth conserva registro, confirmación de correo, inicio y cierre de sesión. `/login/alumno` ofrece registro y acceso; `/alumno` lista asignaciones. No hay contraseñas administradas por el Master ni invitaciones nuevas.

El registro solo envía `display_name`. La autoridad docente continúa derivándose de empresas propias y membresías de campaña existentes, nunca de metadatos editables. Crear una empresa ahora exige esa autoridad en el repositorio. **Una cuenta nueva sin ninguna relación docente no puede auto-habilitarse como Master.** La incorporación de nuevos docentes sin relaciones previas requiere habilitación administrativa explícita; este bloque no implementa su administración. No se crea ni modifica ninguna membresía docente durante el registro o la asignación de alumnos.

## Persistencia y seguridad

`game_card_assignments` enlaza un perfil con una ficha real de partida. Tiene identidad propia, autor, fechas y revisión. Un perfil puede tener como máximo una ficha por partida. La FK compuesta impide mezclar ficha, partida y campaña. Las consultas usan índices por perfil y ficha.

0029 agrega únicamente esta tabla, un índice de identidad en `game_role_cards`, la búsqueda exacta de correo registrada y un guard de estado/revisión. No hace backfill ni cambia fichas existentes. RLS permanece habilitado sin políticas de navegador; `anon` y `authenticated` no tienen acceso directo. `service_role` dispone de SELECT/INSERT/UPDATE/DELETE y de la búsqueda exacta, no de privilegios adicionales sobre `auth.users`.

El caso de uso obtiene el actor de la sesión. El repositorio bloquea campaña y partida, valida membresía Master y estado y controla revisión al corregir/quitar. Co-Master y Observer pueden consultar integrantes, sin modificarlos. Evaluation/completed conservan asignaciones en consulta.

Las lecturas del alumno son independientes de las de Master. La ficha se deriva de su asignación vigente; el navegador no elige una ficha arbitraria. `secret_objective` no forma parte de la proyección SQL. Las restricciones privadas e información privada corresponden únicamente al departamento asignado. Antes de Start solo se muestra la identificación de la partida pendiente, sin contenido ni departamento.

Se refresca la vista cada 15 segundos mientras está visible y al recuperar foco. Cada lectura vuelve a autorizar. No se publican datos por Realtime. La baja/corrección se refleja en la siguiente lectura; no puede revocar contenido que el alumno ya leyó legítimamente.

Reset conserva asignaciones y oculta nuevamente la ficha durante preparación. Successor copia fichas, no alumnos. Delete elimina asignaciones mediante la FK en cascada. No se modifica la protección estructural de fichas después de Start.

## Revisión y prueba manual

No se aplicó la migración remota. Revisar `database/migrations/0029_student_assignments.sql` y, opcionalmente, ejecutar las consultas de solo lectura de `database/preflight/0029.sql` antes de autorizar su aplicación.

Una vez aplicada con aprobación:

1. Registrar dos cuentas en `/login/alumno`. Si Supabase exige confirmación, abrir el correo y luego iniciar sesión explícitamente. Se utiliza la configuración de correo/Site URL existente de Supabase; debe estar configurada para el entorno desplegado.
2. Como Master, abrir una partida con fichas y usar **Integrantes por departamento**. Agregar ambos correos a la misma ficha. Una cuenta no registrada muestra error.
3. Como alumno, comprobar que antes de Start solo aparece una partida pendiente y que una URL de detalle no entrega la ficha.
4. Iniciar la partida con el flujo existente. Ambos alumnos ven la misma ficha y sus compañeros. Probar con ventanas/perfiles de navegador independientes.
5. Comprobar responsabilidades, modificadores, habilidades, debilidades, restricciones privadas propias e información/objetivo público. El objetivo secreto no debe aparecer en respuestas ni HTML.
6. Incorporar un tercer alumno durante active/paused. Corregir su departamento y luego quitarlo; esperar el refresco. Probar una URL de otra partida: 404. Co-Master/Observer no deben tener controles de edición de integrantes.
7. Abrir dos vistas Master y corregir la misma asignación; la segunda operación con revisión vieja debe pedir recargar.
8. Reset conserva integrantes y oculta el contenido. Al completar, se mantiene consulta histórica. La sucesora comienza sin integrantes.

## Verificación local

- `database/tests/student-auth.test.cjs`: contrato Auth con cliente simulado, confirmación y sesión inmediata, metadatos limitados, errores y logout. No registra cuentas remotas.
- `database/tests/students.integration.cjs`: PostgreSQL temporal, permisos, privacidad, asociaciones, revisión, Reset/successor/Delete, constraints y RLS.
- Regresiones: `role-cards.integration.cjs`, `game-rules.integration.cjs`, `records.integration.cjs`.
- `npm run lint`, `npm run db:check`, `npm run build` desde `apps/web`.

La entrega no implementa habilidades ejecutables, evaluación individual ni revelación de objetivos secretos.

## Archivos de esta entrega

- `apps/web/src/app/alumno/page.tsx`
- `apps/web/src/app/alumno/partidas/[id]/page.tsx`
- `apps/web/src/app/login/alumno/page.tsx`
- `apps/web/src/app/master/page.tsx`
- `apps/web/src/app/master/partidas/[id]/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/db/schema/game-card-assignments.ts`
- `apps/web/src/db/schema/index.ts`
- `apps/web/src/db/schema/role-cards.ts`
- `apps/web/src/features/auth/application/student-auth.ts`
- `apps/web/src/features/auth/components/StudentLoginForm.tsx`
- `apps/web/src/features/auth/repositories/teacher-access.repository.ts`
- `apps/web/src/features/cards/components/CardStructureView.tsx`
- `apps/web/src/features/companies/repositories/company.repository.ts`
- `apps/web/src/features/students/application/assignment-actions.ts`
- `apps/web/src/features/students/application/get-game-participants.ts`
- `apps/web/src/features/students/application/student-access.ts`
- `apps/web/src/features/students/components/GameParticipants.tsx`
- `apps/web/src/features/students/components/ParticipantForm.tsx`
- `apps/web/src/features/students/components/StudentCard.tsx`
- `apps/web/src/features/students/components/StudentRefresh.tsx`
- `apps/web/src/features/students/domain/assignment.ts`
- `apps/web/src/features/students/repositories/assignment.repository.ts`
- `apps/web/src/features/students/repositories/student.repository.ts`
- `database/migrations/0029_student_assignments.sql`
- `database/migrations/meta/0029_snapshot.json`
- `database/migrations/meta/_journal.json`
- `database/preflight/0029.sql`
- `database/tests/game-rules.integration.cjs`
- `database/tests/role-cards.integration.cjs`
- `database/tests/student-auth.test.cjs`
- `database/tests/students.integration.cjs`
- `docs/ALUMNOS_0029.md`
