# NEXUS — Decisiones de diseño

Fuente de verdad de las decisiones del proyecto. Las issues de GitHub citan estos códigos (`D-xx`, `M-1`) en lugar de copiar el texto. Si una decisión cambia, se edita acá en el mismo Pull Request que la implementa y se anota la fecha.

Última actualización: 20/11/2026.

## Decisiones

| Código | Decisión | Estado |
| --- | --- | --- |
| D-01 | Una sola cuenta por persona (Supabase Auth). Los permisos dependen del contexto: no existe un rol global como "alumno" o "docente". | Implementado (0029–0030) |
| D-02 | La institución real (UTN, una empresa que capacita) es distinta de la empresa simulada del juego. | Implementado (0030) |
| D-03 | Registrarse no da acceso a nada. Para pertenecer a una institución hace falta una aprobación o un método de ingreso válido (ver "Ingreso"). | Implementado (0030) |
| D-04 | La ficha es del departamento dentro de una partida. Varios alumnos la comparten sin duplicarla. | Implementado (0029) |
| D-05 | Un alumno pertenece a un solo departamento por partida y puede cambiar de departamento en otra partida. | Implementado (0029) |
| D-06 | Los recursos de la ficha (revelaciones, usos de habilidades) son grupales por departamento. Los controla la base de datos, no el botón. | Implementado para revelaciones (0031) |
| D-07 | Entre partidas se hereda la configuración, no el estado de uso. Reset devuelve los recursos consumidos. | Implementado (0031) |
| D-08 | El objetivo secreto nunca viaja al navegador fuera de la ventana de revelación autorizada. | Implementado (0031) |
| D-09 | Las habilidades se definen en la ficha. Su efecto lo evalúa el Master, no una fórmula automática. | Pendiente |
| D-10 | Todas las metas valen 1. El resultado tiene 5 categorías según el porcentaje cumplido (Victoria épica a Fracaso épico). | Implementado (0021) |
| D-11 | Las situaciones (manuales, del Master) son distintas de las reglas automáticas (al cierre de cada período). | Implementado (0023–0025) |
| D-12 | Migraciones solo hacia adelante: no se edita una migración aplicada y se revisa cada una antes de `db:migrate`. | Proceso vigente |
| D-13 | Antes de subir a Vercel se termina y se prueba bien la funcionalidad. | Vigente |
| D-14 | Se puede desarrollar con Supabase local en Docker (ver "Supabase local" en `README.md`) o contra Supabase en la nube. Actualizada el 18/11/2026 (#26); antes, Supabase local era una mejora futura. | Vigente |
| D-15 | Cada institución puede organizarse por dentro como quiera (regionales, facultades, sucursales, materias). Detalle en D-26. | Pendiente |
| D-16 | Las instituciones nuevas las aprueba la administración de NEXUS. | Pendiente |
| D-17 | Puede haber varios admins de NEXUS. El primero se crea por script; después se nombran desde un panel de administración. | Pendiente |
| D-18 | Las instituciones se registran con un formulario y quedan pendientes hasta que las apruebe un admin de NEXUS. Quien la registró queda como su primer admin. | Pendiente |
| D-19 | Cada institución puede tener varios admins (2 o 3 es lo esperable). Los admins otorgan el rol de docente. | Pendiente |
| D-20 | Solo crea simulaciones (empresas simuladas, campañas y partidas) quien tiene rol docente otorgado por un admin. Ser miembro no alcanza. | Pendiente |
| D-21 | Para participar hay que registrarse sí o sí. El QR o código de campaña no da ingreso a la institución: si el usuario no es miembro, ve un aviso para pedir acceso y no ve la campaña hasta que lo aprueben. | Pendiente |
| D-22 | El alumno entra una vez a cada campaña. El departamento de la simulación se asigna en cada partida y se puede editar. | Pendiente |
| D-23 | En cada partida nueva, el docente elige: mantener los departamentos de la anterior, repartir por sorteo entre los alumnos de la campaña o asignar a mano. | Pendiente |
| D-24 | Los códigos y QR para entrar a una campaña vencen siempre. El código de la materia no vence (M-1). Solo el docente puede agregar alumnos a mano. | Pendiente |
| D-25 | Co-Masters y Observers tienen que ser de la misma institución. Las colaboraciones entre instituciones quedan para más adelante. | Pendiente |
| D-26 | Las instituciones se organizan como un árbol de unidades. El admin de una unidad administra todo lo que tiene adentro, pero no las unidades de al lado ni las de arriba. Cada unidad puede tener varios admins. Una institución chica usa un solo nivel. | Pendiente |
| D-27 | Reemplazada por M-1. | — |
| D-28 | Cada institución puede declarar sus dominios de correo. Quien se registra con ese correo verificado entra directo como miembro, nunca como docente. | Pendiente |
| D-29 | Los niveles de la institución se llaman "unidades" en el sistema y cada institución les pone su nombre. "Departamento" queda reservado para los de la simulación. | Pendiente |
| D-30 | Por ahora no se reemplaza Supabase por un Postgres propio: Supabase Auth sostiene el login. | Vigente |
| D-31 | La puerta de entrada decide qué experiencia se ve: "Acceso administrativo" muestra solo el perfil administrativo (instituciones, materias, campañas, Master) y "Acceso de usuarios" muestra solo el portal del participante. Nunca se mezclan en una misma pantalla. Los permisos siguen dependiendo de los roles reales (D-01): entrar por una puerta no da permisos; si la cuenta no tiene ese rol, ve un aviso. | Pendiente |
| D-32 | El participante está parado en una institución a la vez. Menú del avatar (arriba a la derecha): nombre, institución actual, "Cambiar de institución" (solo si pertenece a más de una), "Unirme a otra institución", "Mis solicitudes", "Mi perfil", "Configuración" y "Cerrar sesión"; se pueden sumar opciones en el futuro. Al cambiar de institución, todo el portal (materias, campañas, partidas) pasa a ser el de esa institución. Con una sola institución entra directo. NEXUS recuerda la última institución elegida. "Mis accesos" y "Mis instituciones" dejan de ser pantallas del participante: lo que tenían pasa al menú. | Pendiente |
| D-33 | Metas y Reglas tienen un interruptor 'Obligatorio' por partida. Por defecto, Metas es obligatoria (sin metas no hay resultado final) y Reglas opcional. Una sección obligatoria vacía bloquea el inicio, verificado en el servidor y en la base. Las partidas que ya existían quedan con Metas opcional. | Pendiente |
| D-34 | Al crear la partida siguiente se heredan los integrantes de cada departamento: cada persona pasa al departamento equivalente (la misma ficha base de la campaña), solo si sigue siendo miembro activo de la institución y la empresa está vinculada, igual que para agregar un integrante. Se hereda la asignación, no el estado de uso (D-07). El Master puede quitar o agregar integrantes como siempre. Es la opción "mantener" de D-23 como comportamiento por defecto. Agregada el 20/11/2026 (#87). | Implementado (#87) |
| D-35 | Metas en el dashboard: durante el juego cada meta muestra un estado provisorio según el KPI ("Se cumple hoy" / "No se cumple hoy"). Mientras la partida está en evaluación, el dashboard no muestra lo que el Master va evaluando: solo "En evaluación" y el avance (n de m evaluadas), sin decir cuáles ni cómo; esas evaluaciones no se envían. "Cumplida"/"No cumplida" por meta y el resultado con la escala D-10 aparecen recién después de "Finalizar partida". Agregada el 20/11/2026 (#34). | Implementado (#34) |
| M-1 | Matrícula en dos pasos: materia con código fijo, campaña con QR que vence (ver "Ingreso, registro y matrícula"). | Pendiente |
| M-2 | Un miembro de la institución puede buscar las materias de SUS instituciones (nunca de otras) en un catálogo con buscador. Cada materia define cómo se entra: con código (por defecto), abierta (sin código, para cualquier miembro) o con solicitud que aprueba el docente. | Pendiente |
| M-3 | El uso de una habilidad genera un aviso en el muro del dashboard. El Master elige, por habilidad, si se anuncia públicamente (por defecto sí). Formato: "<emoji> <Departamento> usó <Habilidad> · <Período>" y debajo una descripción corta del efecto. El aviso público nunca muestra los usos restantes ni el límite de uso: eso lo ve solo el departamento en su propia ficha. Las revelaciones del objetivo secreto nunca se publican. Todos los avisos quedan también en Registros. Actualizada el 19/11/2026. | Pendiente |

## Estructura de las organizaciones

Cada institución arma un árbol de unidades con los niveles que necesite. Las simulaciones viven en la materia, la unidad del último nivel.

```
UTN (institución)
└── Facultad Regional San Rafael (unidad)
    └── Desarrollo de Software 2025 (materia)
        └── empresas simuladas → campañas → partidas
```

1. El admin de una unidad administra esa unidad y todo lo que tiene debajo, pero nada de al lado ni de arriba (D-26).
2. Un miembro aprobado en una unidad pertenece también a la institución completa.
3. La empresa simulada pasa a colgar de una unidad. Hoy cuelga de la institución (0030): hay que migrarla sin perder datos.
4. Una institución chica puede no tener sub-unidades.

## Roles y permisos

Cada rol vale solo en un lugar, y una misma persona puede tener varios. NEXUS administra instituciones; no entra al contenido de las unidades ni de las campañas.

| Rol | Dónde aplica | Quién lo asigna | Qué puede hacer |
| --- | --- | --- | --- |
| Admin de NEXUS | La plataforma | Otro admin de NEXUS (el primero, por script) | Administra instituciones: las aprueba, las suspende y nombra su primer admin. No entra al contenido de unidades ni campañas desde la app. |
| Soporte técnico de NEXUS | La base de datos | Un admin de NEXUS | Solo ante un error grave que la institución no puede resolver: entra a la base para corregirlo. Cada intervención queda registrada. |
| Admin de institución o unidad | Su unidad y todo lo de adentro | Un admin de NEXUS (el primero) o un admin de la unidad de arriba | Maneja personas: aprueba miembros, resuelve problemas de ingreso y nombra admins, soporte técnico y docentes. Elige los métodos de ingreso y los datos del registro, o delega esa elección en cada unidad. |
| Soporte técnico de institución o unidad | Su unidad y todo lo de adentro | Un admin | Maneja la estructura: crea y organiza regionales, sucursales y materias. No maneja personas. |
| Docente | Una materia | Un admin | Es Master automáticamente de todas las campañas de su materia. Crea campañas, códigos y QR, agrega alumnos y nombra Masters, Co-Masters y Observers. Si la materia tiene dos docentes, los dos son Masters. |
| Master | Una campaña | Un docente | Dirige toda la campaña: partidas, fichas, KPIs, metas, situaciones, reglas, departamentos, registros y evaluación. Puede no ser docente (ayudante, laboratorio). |
| Co-Master | Una campaña | Un docente (no el Master) | Hace todo lo del Master durante el juego. No da permisos ni maneja a otros Masters. |
| Observer | Una campaña | Un docente | Ve el dashboard de la partida en curso y los registros de la partida. No ve fichas, departamentos de los alumnos ni datos privados. |
| Participante | Las campañas donde está | Él mismo con código o QR, o el docente | Ve su perfil, sus campañas y la ficha de su departamento. Usa habilidades y revelaciones. |

## Ingreso, registro y matrícula

1. **Métodos de ingreso a la institución:** cada institución elige uno o más entre (a) cuenta institucional de Microsoft o Google, (b) correo del dominio de la institución, verificado (D-28), y (c) solicitud que aprueba un admin. Puede elegirlos para toda la institución o delegar la elección en cada unidad.
2. **Datos del registro:** cada institución (o unidad, si lo delegó) elige qué datos pide y cuáles son obligatorios. Por defecto: nombre y apellido, documento, correo y teléfono. Catálogo opcional: legajo, carrera, área, número de empleado y sede. Solo los ven los admins de esa institución.
3. **Matrícula en dos pasos (M-1):**

| Paso | Cómo se entra | ¿Vence? | Quién puede agregar a mano |
| --- | --- | --- | --- |
| 1. Materia | El alumno se matricula solo con el código de matriculación de la materia | No | — |
| 2. Campaña | El alumno escanea el QR que comparte el docente. Tiene que estar matriculado en la materia | Sí, siempre | Solo el docente |

Orden completo: miembro de la institución → matriculado en la materia → dentro de la campaña → departamento en cada partida. El docente elige o sortea departamentos solo entre los que están en la campaña, nunca entre todos los miembros de la institución.

## Seguridad

Referencia: OWASP Top 10 y ASVS. En orden de prioridad:

1. Permisos verificados siempre en el servidor y en la base, nunca solo ocultando botones.
2. SQL siempre parametrizado. Prohibido `sql.raw` o `unsafe` con datos del usuario.
3. Usuario de base con permisos mínimos y, a mediano plazo, políticas RLS como segunda barrera.
4. MFA obligatorio para admins de NEXUS y de instituciones.
5. Límite de intentos en login, registro, solicitudes y códigos. Códigos largos, aleatorios y con vencimiento.
6. Validación en el servidor de todo lo que llega del navegador (tipo, largo, formato).
7. Registro de toda acción de admins y del soporte de NEXUS.
8. Prohibido `dangerouslySetInnerHTML` con contenido de usuarios. Encabezados de seguridad (CSP) al desplegar.
9. Secretos nunca en el repo. Escaneo de secretos de GitHub. `service_role` nunca en el navegador.
10. Dependabot y `npm audit`.
11. Datos personales: pedir solo lo necesario y cumplir la Ley 25.326. Documento y teléfono visibles solo para los admins de esa institución. Consentimiento para grabar audio.
12. Copias de seguridad periódicas propias (el plan gratuito de Supabase no las hace).
13. Lista de chequeo de seguridad en cada Pull Request (ver `CLAUDE.md`).

## Mapa de decisiones por issue

| Issue | Decisiones y secciones |
| --- | --- |
| Admin de NEXUS y aprobación de instituciones | D-16, D-17, D-18; Roles: Admin y Soporte técnico de NEXUS |
| Árbol de unidades con admins y soporte técnico | D-15, D-26, D-29; Estructura; Roles: Admin y Soporte técnico de institución |
| Rol docente por materia | D-19, D-20; Roles: Docente y Master |
| Co-Master y Observer | D-25; Roles: Co-Master y Observer |
| Métodos de ingreso configurables | D-03, D-28; Ingreso, punto 1 |
| Datos de registro configurables | Ingreso, punto 2; Seguridad, punto 11 |
| Matrícula en la materia con código fijo | M-1 |
| QR de campaña con vencimiento | M-1, D-21, D-24 |
| Catálogo y buscador de materias para matricularse | M-1, M-2 |
| Elegir alumnos de la lista de matriculados | M-1, D-22 |
| Distribución de alumnos por partida | D-22, D-23 |
| Heredar integrantes en la partida siguiente | D-07, D-23, D-34 |
| Habilidades utilizables | D-06, D-07, D-09, M-3 |
| Dashboard: avance de las metas y resultado final | D-10, D-35 |
| Dashboard: muro de avisos | M-3 |
| Interruptor 'Obligatorio' para Metas y Reglas | D-33 |
| Puertas de entrada separadas y menú del usuario | D-01, D-31, D-32 |
| Issues de seguridad | Seguridad, puntos 3 a 12 |
