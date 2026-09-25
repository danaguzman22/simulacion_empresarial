# Instituciones y transición — 0030

## Identidad y experiencias

Supabase Auth sigue siendo la única identidad y contraseña. Iniciar sesión desde `/login`, `/login/master` o `/login/alumno` conduce a `/acceso`. Se muestran los accesos docentes y/o de participante que realmente tenga el usuario, además de Mis instituciones. El registro no crea membresías, roles de campaña ni asignaciones.

Los roles institucionales son `admin`, `teacher` y `member`; la membresía puede estar `active` o `revoked`. No existe un rol global excluyente por persona. Admin administra solicitudes y puede crear empresas; teacher puede crear empresas. Ninguno obtiene acceso a campañas ajenas por ese rol: se siguen requiriendo propiedad o `campaign_members`, según el recurso. La aprobación siempre concede `member`. La habilitación docente para crear empresas es una acción administrativa separada, explícita y con revisión. No cambia roles en campañas existentes.

## Modelo y migración

0030 agrega `institutions`, `institution_members`, `institution_access_requests`, sus enums e índices y `companies.institution_id`. Campañas y partidas heredan la institución a través de su empresa; no se duplican esos identificadores en todas las tablas.

- Una membresía por persona/institución.
- Una solicitud pendiente por persona/institución; después de rechazo puede solicitar nuevamente.
- Aprobar/rechazar bloquea la institución y solicitud; aprobar inserta/reactiva membresía básica en la misma transacción. Repetir la misma resolución es un replay; una resolución opuesta se rechaza.
- Revocar conserva relaciones e historial. Reactivar mediante una nueva aprobación concede membresía básica, no restaura el rol institucional anterior automáticamente.
- RLS habilitado, sin acceso directo de `anon`/`authenticated`. `service_role` lee instituciones; lee/inserta/actualiza membresías y solicitudes. No tiene creación de instituciones ni eliminación de membresías/solicitudes.
- Una función de lectura limitada devuelve correos solo de solicitudes pendientes de una institución y exige un administrador vigente; no se expone `auth.users` al navegador.
- Las asignaciones por correo buscan únicamente cuentas aprobadas en la institución destino; una cuenta inexistente y una no aprobada reciben el mismo mensaje.

## Transición aprobada

Las empresas existentes quedan con `institution_id = NULL`. No se inventa ninguna institución o membresía. Conservan propietarios, roles de campaña, fichas, alumnos, KPIs y todo el historial. Los permisos existentes siguen funcionando: Start, rondas, Reset, successor y consultas. La UI muestra **Pendiente de vinculación institucional · Acceso legado**.

Hasta vincular no se permite crear campañas nuevas, incorporar/cambiar membresías docentes ni agregar/mover alumnos de departamento. Esto evita ampliar autoridad o acceso privado usando el legado. Se permite quitar asignaciones. Crear partidas sucesoras dentro de campañas existentes conserva sus roles; no copia alumnos.

Las empresas nuevas requieren una institución y habilitación docente vigente desde el primer INSERT. La base rechaza omitir la institución; la API comprueba identidad y permisos.

## Vinculación explícita

La pantalla de una institución muestra a su administrador las empresas pendientes **que él mismo posee**. Vincular exige simultáneamente esa propiedad y administración vigente en el destino; conocer un ID no alcanza.

Antes de vincular se comprueba que el propietario, todos los miembros de campañas y todos los alumnos asignados tengan membresía vigente en el destino. Deben solicitar acceso y ser aprobados explícitamente. No se crean membresías por deducción. Si alguna falta, la vinculación se rechaza sin cambios.

Al vincular se conserva todo el contenido y se exige inmediatamente membresía institucional más los permisos específicos. No hay fallback legado para una empresa vinculada. La aplicación y un trigger impiden desvincular o moverla a otra institución. Si propietario y administrador institucional son personas distintas, se requiere una decisión administrativa explícita; este MVP no incorpora transferencias ni autoatribución de empresas ajenas.

## Primer administrador

No hay formulario público para crear instituciones ni elevarse a admin. Un operador de NEXUS con acceso administrativo a la base verifica fuera de la aplicación la organización y el UUID del perfil responsable (cuenta previamente registrada).

Luego de aplicar 0030 con aprobación, puede usar `database/admin/provision-institution.sql` con **psql**, desde una conexión administrativa configurada fuera del comando:

```text
psql -v institution_name="Nombre verificado" -v institution_type="educational" -v admin_profile_id="UUID_VERIFICADO" -f database/admin/provision-institution.sql
```

Tipos permitidos: `educational`, `company`, `other`. El procedimiento es transaccional, verifica que exista el perfil y no contiene correos, credenciales ni una institución predeterminada. `granted_by` del primer admin identifica a la persona habilitada; la autorización inicial proviene del operador verificado, no del autorregistro. Este procedimiento no se ejecutó contra Supabase; se verificó en PostgreSQL local desechable. No debe repetirse sin revisar previamente instituciones existentes, porque no presume que nombres iguales identifiquen la misma organización.

Los administradores adicionales o su reemplazo también requieren intervención administrativa explícita. La UI no concede admin ni modifica otros admins, y PostgreSQL impide revocar al último administrador activo mediante UPDATE.

## Protección y revocación

Las lecturas de empresas, campañas, partidas, fichas, Records y panel alumno verifican la institución. Las operaciones de partida usan el guard compartido; las escrituras mantienen el bloqueo de membresía mientras operan. Revocar una membresía bloquea las siguientes operaciones/lecturas aunque exista sesión o asignación conservada. La información ya leída legítimamente no puede retirarse del navegador; el refresco del alumno vuelve a validar.

El objetivo secreto continúa fuera de la proyección SQL del alumno. Aprobar en una institución no concede acceso a otra, ni a todas las partidas de la institución aprobada.

## Verificación manual después de revisar/aplicar

1. Comprobar el preflight de solo lectura `database/preflight/0030.sql`. Revisar 0030 antes de ejecutar cualquier migración remota.
2. Registrar cuenta nueva: en Mis accesos solo debe ofrecer instituciones. Buscar una institución y solicitar acceso; duplicar envío no duplica solicitudes pendientes.
3. Como admin, revisar nombre/correo/mensaje/fecha y aprobar o rechazar. El rechazo no crea membresía; aprobar no asigna ficha ni habilita Master.
4. Asignar a una ficha: el Master requiere la cuenta aprobada en la institución de la partida. Probar un correo de otra institución: rechazo sin revelar si está registrado.
5. Entrar con una cuenta docente por ambos logins y con una cuenta participante por login docente. La selección depende de permisos, no de la URL. Una persona con ambos vínculos ve ambas opciones.
6. Verificar empresa legado: usuarios anteriores mantienen acceso; agregar/mover alumno y crear empresa nueva sin institución fallan.
7. Aprobar expresamente a todos los participantes anteriores y vincular una empresa propia como admin. Revocar luego a un alumno/co-Master: pierde acceso aunque siga conectado. Restituir exige una nueva solicitud/aprobación.
8. Probar Reset, sucesora y consulta histórica. No se copian asignaciones a sucesoras ni se revela el objetivo secreto.

No se ejecutó `db:migrate`, commit ni push. La confirmación de correo con Supabase real y la revisión visual manual quedan a cargo de la prueba del entorno desplegado.

## Resultado de las verificaciones finales

- PostgreSQL local: `institutions.integration.cjs`, `students.integration.cjs`, `role-cards.integration.cjs`, `records.integration.cjs`, `game-rules.integration.cjs`: aprobados.
- La prueba institucional inicia y resetea una partida antes de vincular su empresa; conserva las asignaciones y vuelve a ocultar la ficha durante preparation.
- Solicitudes duplicadas concurrentes, rechazo, aprobaciones concurrentes, rollback de fallo inyectado, autoaprobación y actor falsificado: verificados.
- Vinculación explícita, aislamiento entre instituciones, doble experiencia, revocación con sesión existente y revisión desactualizada: verificados.
- `student-auth.test.cjs`: registro sin roles, confirmación, login por ambas entradas hacia `/acceso` y logout: aprobado con cliente Auth simulado.
- `npm run lint`, `npm run db:check`, `npm run build`: finalizaron con código 0.
- Comparación en memoria del schema Drizzle con `0030_snapshot.json`, enlace al snapshot 0029 y entrada final del journal: sin divergencia. No se ejecutó `db:generate` al retomar.
- El procedimiento del primer administrador se ejecutó correctamente solo en PostgreSQL local de pruebas.

## Archivos de 0030

El working tree conserva además archivos de 0029 que aún no estaban versionados. La siguiente lista corresponde a 0030 respecto de aquella implementación; las migraciones 0000–0029 no se modificaron.

Creados:

- `apps/web/src/app/acceso/page.tsx`
- `apps/web/src/app/instituciones/page.tsx`
- `apps/web/src/app/instituciones/[id]/page.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/db/schema/institutions.ts`
- `apps/web/src/features/auth/application/get-experiences.ts`
- `apps/web/src/features/institutions/application/get-institutions.ts`
- `apps/web/src/features/institutions/application/institution-actions.ts`
- `apps/web/src/features/institutions/components/InstitutionDetail.tsx`
- `apps/web/src/features/institutions/components/InstitutionForm.tsx`
- `apps/web/src/features/institutions/domain/institution.ts`
- `apps/web/src/features/institutions/repositories/institution-access.ts`
- `apps/web/src/features/institutions/repositories/institution.repository.ts`
- `database/migrations/0030_institutions.sql`
- `database/migrations/meta/0030_snapshot.json`
- `database/preflight/0030.sql`
- `database/admin/provision-institution.sql`
- `database/tests/institution-fixture.cjs`
- `database/tests/institutions.integration.cjs`
- `docs/INSTITUCIONES_0030.md`

Modificados:

- `apps/web/src/app/login/master/page.tsx`
- `apps/web/src/app/master/empresas/[id]/page.tsx`
- `apps/web/src/app/master/page.tsx`
- `apps/web/src/app/alumno/page.tsx`
- `apps/web/src/db/schema/companies.ts`
- `apps/web/src/db/schema/index.ts`
- `apps/web/src/features/auth/application/sign-in-master.ts`
- `apps/web/src/features/auth/application/student-auth.ts`
- `apps/web/src/features/auth/components/StudentLoginForm.tsx`
- `apps/web/src/features/auth/repositories/teacher-access.repository.ts`
- `apps/web/src/features/campaigns/application/list-company-campaigns.ts`
- `apps/web/src/features/campaigns/components/CompanyCampaigns.tsx`
- `apps/web/src/features/campaigns/repositories/campaign.repository.ts`
- `apps/web/src/features/cards/repositories/card.repository.ts`
- `apps/web/src/features/companies/application/create-company.ts`
- `apps/web/src/features/companies/components/CompanyDetail.tsx`
- `apps/web/src/features/companies/components/CompanyList.tsx`
- `apps/web/src/features/companies/components/CreateCompanyForm.tsx`
- `apps/web/src/features/companies/domain/company.ts`
- `apps/web/src/features/companies/repositories/company.repository.ts`
- `apps/web/src/features/games/application/list-campaign-games.ts`
- `apps/web/src/features/games/repositories/game-lifecycle.repository.ts`
- `apps/web/src/features/games/repositories/game.repository.ts`
- `apps/web/src/features/preparation/repositories/preparation.repository.ts`
- `apps/web/src/features/students/repositories/assignment.repository.ts`
- `apps/web/src/features/students/repositories/student.repository.ts`
- `apps/web/src/features/students/components/GameParticipants.tsx`
- `apps/web/src/features/students/components/ParticipantForm.tsx`
- `database/migrations/meta/_journal.json`
- `database/tests/game-rules.integration.cjs`
- `database/tests/records.integration.cjs`
- `database/tests/role-cards.integration.cjs`
- `database/tests/students.integration.cjs`
- `database/tests/student-auth.test.cjs`
