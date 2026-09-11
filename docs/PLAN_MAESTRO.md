SIMULACIÓN EMPRESARIAL
Plan maestro de producto, arquitectura y desarrollo
Marca visual actual: NEXUS (provisional)
Versión inicial de seguimiento · 11 de septiembre de 2026
Objetivo del documento: mantener una única referencia de lo que queremos construir, qué decisiones técnicas ya tomamos, qué funcionalidades debe soportar el sistema y en qué etapa estamos. La intención es actualizarlo a medida que avanzamos.
 
1. Visión general del producto
Simulación Empresarial será una plataforma web modular para ejecutar y administrar simulaciones empresariales educativas. NEXUS se mantiene por ahora como nombre y logo visibles, pero el repositorio y la arquitectura se denominan simulacion_empresarial para no atar el proyecto a una marca definitiva.
Idea central
Master, jugadores/departamentos y Display no son aplicaciones separadas: son vistas de una misma plataforma, conectadas a una misma sala y a un mismo estado persistente.

•	Master: administra empresas, campañas, partidas, rondas, departamentos, KPIs, objetivos, habilidades, eventos y Display.
•	Jugador/Departamento: accede solamente a su ficha y a las acciones que le corresponden.
•	Display: se vincula mediante código de sala y muestra el estado público de la simulación en tiempo real.
•	La plataforma debe soportar más de un Master conectado a la misma sala y, a futuro, distintos permisos de Master.
2. Principios de arquitectura que no queremos romper
•	Una plataforma integrada: No volver a separar Dashboard y Fichas como productos independientes.
•	Páginas livianas: Los page.tsx deben componer la pantalla, no contener toda la lógica ni cientos de líneas de interfaz.
•	Visuales modulares: KPIs, alertas, objetivos, habilidades, cronómetros, tarjetas y controles viven en componentes separados.
•	Reglas fuera de la UI: La interfaz muestra; el dominio decide si una acción está permitida.
•	Acceso a datos encapsulado: Los componentes no deben realizar consultas SQL/Supabase directamente; se usan repositorios/servicios.
•	Estado persistente: La continuidad de una empresa y sus partidas no puede depender de localStorage.
•	Escalabilidad por datos: No hardcodear '4 partidas' o '4 rondas'. Deben ser registros configurables.
•	Migraciones versionadas: Toda evolución del esquema debe quedar registrada y reproducible.
•	Privacidad por servidor: Información secreta de un departamento no se envía a todos los clientes para luego ocultarla con CSS.
•	Auditoría: Las acciones relevantes deben quedar registradas para historial, resúmenes, evaluación y trazabilidad.
3. Arquitectura técnica elegida
Capa	Tecnología / ubicación	Responsabilidad
Presentación	Next.js + React + TypeScript	Rutas, pantallas y componentes visuales.
Aplicación	features/*/application	Casos de uso: crear sala, iniciar ronda, usar habilidad, etc.
Dominio	features/*/domain	Reglas del juego independientes de la interfaz.
Persistencia	Repositories + Drizzle ORM	Acceso tipado a PostgreSQL.
Backend gestionado	Supabase	PostgreSQL, Auth, Realtime y Storage cuando sea necesario.
Despliegue inicial	Vercel + Supabase	Web y servicios gestionados sin Docker obligatorio.
Agentes futuros	Python + uv	Servicio separado para agentes/IA cuando exista una necesidad real.
Infra futura	Docker	Se incorpora cuando haya varios servicios que justifiquen orquestación.

Flujo conceptual: UI → caso de uso → reglas de dominio → repositorio → Drizzle → PostgreSQL/Supabase.
4. Estructura del repositorio
Repositorio definitivo: simulacion_empresarial
simulacion_empresarial/
├── apps/
│   └── web/                  Next.js
├── services/
│   └── agents/               futuro Python + uv
├── packages/                 código compartido futuro
├── database/
│   └── migrations/           migraciones versionadas
├── docs/
│   └── architecture/         decisiones y documentación
└── infra/                    Docker/deploy futuro
Estructura interna de la aplicación web
apps/web/src/
├── app/            rutas y layouts
├── components/     UI reutilizable
│   ├── shared/
│   ├── master/
│   ├── player/
│   ├── display/
│   ├── kpis/
│   └── alerts/
├── features/
│   ├── rooms/
│   ├── companies/
│   ├── campaigns/
│   ├── games/
│   ├── rounds/
│   ├── departments/
│   ├── abilities/
│   ├── objectives/
│   ├── events/
│   ├── kpis/
│   └── finances/
├── db/             Drizzle y esquemas
├── lib/            Supabase, auth e infraestructura
├── types/
├── constants/
└── utils/
Regla de mantenimiento
Si un archivo empieza a tener varias responsabilidades o se vuelve difícil de editar, se divide. Los KPIs, avisos, habilidades, objetivos y controles deben crecer como módulos independientes.

5. Modelo funcional del juego
Jerarquía base:
Empresa ficticia	Entidad persistente que representa la organización simulada.
Campaña	Recorrido completo de un grupo dentro de esa empresa.
Partida	Etapa concreta del recorrido; puede haber tantas como requiera el diseño.
Ronda	Unidad temporal y operativa dentro de una partida.
Diseño base esperado: una Partida 0 de explicación/preparación, aproximadamente cuatro partidas de desarrollo y una instancia final de resultados. Esa cantidad NO se codificará como fija: el sistema debe permitir más o menos partidas y rondas.
Continuidad entre partidas
•	El estado final de una partida alimenta el estado inicial de la siguiente.
•	Ejemplo: si el presupuesto termina en 1.000, la siguiente partida comienza desde 1.000 salvo movimientos previos autorizados.
•	También pueden heredarse Lead Time, inventario, KPIs, compromisos, decisiones y otros estados relevantes.
•	Al cerrar una partida se genera un resumen y un snapshot de continuidad.
Preparación antes de una nueva partida
•	El Master puede registrar una inyección o reducción de recursos antes de iniciar.
•	Tipos iniciales: préstamo, inversión, cierre de trato u otro movimiento configurable.
•	El cambio se registra como transacción, no como simple reemplazo de un número.
•	Debe quedar trazabilidad de monto, tipo, autor, fecha, partida y explicación.
6. Roles y experiencias de usuario
Master
•	Login real con usuario propio; se abandona la idea de una única MASTER_PASSWORD compartida.
•	Puede pertenecer a una sala y compartir el control con otros Masters.
•	Futuro previsto: Master principal, Co-Master y Observador con permisos diferentes.
•	Panel principal con empresa activa, partida, ronda y accesos a módulos.
•	Administra Display, departamentos, objetivos, habilidades, KPIs, eventos, finanzas, partidas y configuración.
•	Puede editar los modificadores/atributos y la información de las fichas de los departamentos.
Jugador / Departamento
•	Ingresa mediante sala y credenciales/identidad asignada.
•	Solo recibe la ficha que le corresponde: Dirección, Comercial, Ingeniería, Producción o Finanzas.
•	Ve rol, responsabilidades, foco, mirada, atributos/modificadores, objetivo público, objetivo secreto y habilidades.
•	Puede ejecutar habilidades autorizadas con confirmación previa.
•	La información secreta debe controlarse en servidor y no enviarse a otros roles.
Display
•	Se conecta a una sala mediante código.
•	Refleja el mismo estado que controla el Master.
•	Muestra KPIs, cronómetro, alertas, objetivo público, eventos y habilidades activadas según configuración.
•	Debe actualizarse en tiempo real mediante Supabase Realtime, no localStorage.
7. Funcionalidades del Master
Módulo	Alcance
Inicio / Dashboard	Empresa activa, campaña, partida actual, ronda actual, estado de la sala y accesos rápidos.
Empresas	Crear, consultar y continuar empresas ficticias con su historial.
Campañas y partidas	Crear/continuar partidas, revisar resúmenes previos y comenzar desde el estado heredado.
Rondas	Iniciar, pausar/cerrar y controlar duración y estado.
Display	Seleccionar qué KPIs, avisos, objetivos y eventos públicos aparecen.
Departamentos	Editar fichas, atributos/modificadores, objetivos, restricciones, habilidades e información privada.
KPIs	Definir, editar y actualizar indicadores de la simulación.
Eventos / avisos	Publicar mensajes y mantener eventos activos en pantalla.
Finanzas	Registrar movimientos previos y durante las partidas, con trazabilidad.
Historial	Consultar acciones, decisiones, cambios y resúmenes.
Configuración	Reglas de sala, tiempos, límites de revelado, permisos y opciones de juego.
8. Fichas, objetivos y habilidades
Fichas de departamentos
•	La información no quedará fija en un archivo TypeScript como en el prototipo; será editable y persistente.
•	El prototipo actual sirve como referencia visual y funcional, no como modelo definitivo de persistencia.
•	El Master podrá modificar atributos/modificadores según la evolución de la simulación.
Objetivo público
•	Visible normalmente en la ficha y, cuando corresponda, también en Display.
•	Puede variar por partida, campaña o departamento.
Objetivo secreto
•	Se muestra oculto por defecto.
•	El jugador puede revelarlo durante un tiempo limitado.
•	El Master configura cantidad máxima de visualizaciones y segundos de revelado.
•	El contador de visualizaciones se guarda en servidor para evitar reinicios desde otro dispositivo.
•	Al agotarse el límite, el objetivo queda bloqueado salvo intervención del Master.
Habilidades
•	Cada habilidad tendrá nombre, descripción, disponibilidad y reglas de uso.
•	Frecuencia posible: una vez por ronda, una vez por partida u otra regla configurable.
•	Antes de consumir una habilidad habrá doble confirmación.
•	Una habilidad agotada no puede reutilizarse hasta que su regla permita reinicio.
•	El uso genera un evento visible para Master y, si corresponde, para Display.
•	Ejemplo previsto: 'Decreto de Prioridad Nacional' usado por Dirección y mostrado como evento activo.
9. KPIs, eventos y visuales modulares
•	KPIs iniciales de referencia: presupuesto, Lead Time e inventario.
•	La arquitectura debe admitir nuevos indicadores sin modificar toda la pantalla: calidad, productividad, satisfacción, servicio, capacidad, deuda, etc.
•	KpiCard, KpiGrid y componentes específicos se desarrollan por separado.
•	Alertas/eventos se administran en un módulo distinto de KPIs.
•	El Display consume datos y componentes; no decide reglas empresariales.
•	El cronómetro/ronda debe ser un componente independiente y sincronizado.
10. Persistencia, datos y migraciones
La base definitiva será PostgreSQL en Supabase. Drizzle ORM será la capa de acceso tipada y Drizzle Kit la herramienta de migraciones. Evitaremos modificar el mismo esquema simultáneamente con dos fuentes de verdad distintas.
Entidades previstas (modelo preliminar)
Entidad candidata	Propósito
profiles	Perfil de usuario asociado a Supabase Auth.
companies	Empresas ficticias.
campaigns	Recorrido persistente de un grupo.
rooms	Sala activa con código de conexión.
room_members	Usuarios/dispositivos conectados y su función.
games	Partidas de una campaña.
rounds	Rondas de una partida.
departments	Dirección, Comercial, Ingeniería, Producción, Finanzas u otros futuros.
department_state	Estado/configuración del departamento dentro de una campaña/partida.
abilities	Definición de habilidades.
ability_usages	Registro de consumos y límites por ronda/partida.
objectives	Objetivos públicos y secretos.
objective_reveals	Control de revelados/visualizaciones.
kpi_definitions	Definición de indicadores disponibles.
kpi_values	Valores actuales e históricos.
financial_transactions	Préstamos, inversiones, tratos y otros movimientos.
events	Acciones y avisos relevantes de la simulación.
game_summaries	Resumen y snapshot de cierre de cada partida.
display_config	Configuración pública de lo mostrado en pantalla.
Importante
Este es un mapa preliminar. Antes de generar la primera migración definiremos relaciones, claves, ownership, políticas RLS y qué estado se guarda como histórico frente a qué estado representa 'lo que pasa ahora'.

11. Seguridad y sincronización
•	Supabase Auth para usuarios reales, especialmente Masters.
•	RLS (Row Level Security) para impedir acceso cruzado entre salas, campañas y datos secretos.
•	Claves secretas jamás dentro de variables NEXT_PUBLIC_.
•	Variables locales en .env.local ignoradas por Git; variables de producción configuradas en Vercel.
•	Realtime para sincronizar Master, jugadores y Display dentro de la misma sala.
•	Acciones sensibles validadas en servidor, no únicamente en el navegador.
•	Historial/auditoría de cambios críticos: habilidades, dinero, KPIs, rondas, objetivos y decisiones administrativas.
•	Códigos de sala legibles y temporales; la sala no reemplaza la autenticación de permisos.
12. Prototipos existentes y migración
•	dashboard-pizarra-digital: se conserva en el repositorio anterior y sigue como referencia funcional/visual.
•	fichas: se conserva como prototipo del acceso individual, privacidad por rol y diseño móvil.
•	No copiamos archivos gigantes sin criterio: migramos comportamiento y componentes de manera modular.
•	El dashboard publicado puede seguir funcionando mientras la plataforma definitiva alcanza paridad.
•	Los cambios experimentales de Supabase del repositorio viejo no deben mezclarse con simulacion_empresarial.
13. Evolución futura
•	Agentes de IA: servicio separado en Python cuando el caso de uso esté definido.
•	Gestión Python propuesta: uv + pyproject.toml + uv.lock; no requirements.txt salvo necesidad externa.
•	Posibles agentes futuros: resumen de partidas, documentación/bitácora, análisis de sesiones y asistencia al Master.
•	Docker no es obligatorio ahora. Se incorpora cuando haya múltiples servicios (web, agentes, workers, Redis/Dragonfly, etc.).
•	La arquitectura debe soportar nuevas áreas, nuevos KPIs, más partidas, más rondas y nuevas reglas sin rediseño total.
•	La marca NEXUS puede cambiar sin afectar nombres técnicos, dominio o modelo de datos.
14. Hoja de ruta de desarrollo
Fase	Bloque	Estado	Resultado esperado
0	Base del repositorio	COMPLETADO	Repo nuevo, estructura inicial, Next.js trasladado, build y push inicial.
1	Fundación técnica	EN CURSO	Supabase definitivo, variables de entorno, Drizzle/PostgreSQL y primera configuración de migraciones.
2	Modelo núcleo	PENDIENTE	Profiles, empresas, campañas, salas y miembros; relaciones y RLS.
3	Autenticación Master	PENDIENTE	Login real y perfiles/roles de administración.
4	Salas y conexión	PENDIENTE	Crear sala, código, unirse, múltiples Masters y presencia.
5	Display sincronizado	PENDIENTE	Estado público y Realtime; migrar visuales útiles del prototipo.
6	Departamentos/jugadores	PENDIENTE	Ingreso por sala, asignación de departamento y ficha privada.
7	Campañas, partidas y rondas	PENDIENTE	Continuidad, tiempos, snapshots y estado heredado.
8	KPIs y finanzas	PENDIENTE	Indicadores configurables, transacciones e inyecciones de dinero.
9	Objetivos y habilidades	PENDIENTE	Públicos/secretos, revelado limitado, usos por ronda/partida y doble confirmación.
10	Eventos e historial	PENDIENTE	Auditoría, eventos activos, resúmenes de partidas y trazabilidad.
11	Panel Master completo	PENDIENTE	Edición de departamentos, Display, configuración y navegación modular.
12	Pruebas y seguridad	PENDIENTE	RLS, permisos, pruebas de dominio, integración y flujos multiusuario.
13	Despliegue estable	PENDIENTE	Vercel + Supabase, variables, entornos Preview/Production y observabilidad.
14	IA / servicios adicionales	FUTURO	Python + uv, agentes y Docker solo si el sistema lo requiere.
15. Estado actual y próximo paso
COMPLETADO hasta ahora
Nuevo repositorio simulacion_empresarial; estructura tipo monorepo; app Next.js en apps/web; instalación y build correctos; dependencias de Supabase, Drizzle ORM, PostgreSQL y Drizzle Kit; proyecto Supabase definitivo creado; variables públicas y DATABASE_URL configuradas localmente.

PENDIENTE DE CONFIRMAR / SIGUIENTE
Dejar cerrada la configuración de Drizzle (dotenv, drizzle.config.ts, src/db/index.ts y schema/index.ts), ejecutar drizzle-kit check y luego diseñar el primer modelo real antes de generar la primera migración.

Primer modelo que diseñaremos
1.	Profiles/Masters y su vínculo con Supabase Auth.
2.	Empresas ficticias.
3.	Campañas persistentes.
4.	Salas con código y estado.
5.	Miembros de sala y permisos.
6.	Después: partidas y rondas.
16. Checklist permanente para no olvidarnos
□ ¿La funcionalidad pertenece a UI, aplicación, dominio o infraestructura?
□ ¿Se puede agregar sin hacer crecer de forma descontrolada un page.tsx?
□ ¿La regla está hardcodeada cuando debería ser configurable?
□ ¿La información privada se filtra a clientes que no deberían recibirla?
□ ¿El cambio necesita auditoría/historial?
□ ¿El cambio debe persistir entre partidas?
□ ¿La siguiente partida debe heredar ese estado?
□ ¿Hay una migración versionada si cambia la base?
□ ¿La acción necesita Realtime para Master/Display/jugadores?
□ ¿Hay que contemplar más de un Master?
□ ¿Funciona si hay más partidas/rondas/KPIs de los previstos inicialmente?
□ ¿Las credenciales y secretos están solo en servidor?
□ ¿El componente visual puede reutilizarse o probarse de forma aislada?
□ ¿Debemos agregar pruebas antes de desplegar?

Cómo usaremos este documento
Después de cada bloque importante, podemos actualizar el estado de la hoja de ruta y registrar decisiones nuevas. Así no dependemos de recordar todo de memoria ni perdemos requisitos a medida que la plataforma crece.

