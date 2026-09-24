# Fuentes de los presets de Fichas v2

Se revisaron las fuentes locales disponibles el 23/09/2026. Las fechas siguientes son las de modificación de los archivos disponibles; no prueban por sí solas una versión editorial.

- `../investigacion_proyecto/prototipos/fichas/src/lib/fichas.ts` (10/09/2026): identidad, descripción, responsabilidades, foco, estilo y atributos de Búho, Zorro, Castor, Toro y Ardilla. Se conservan esos textos. Los atributos ausentes se omiten en los nuevos presets; no se convierten en ceros seleccionados. Esto no cambia los ceros ya guardados por 0027.
- `../HABILIDADES ÚNICAS POR SECTOR.docx` (31/08/2026): tres habilidades por personaje. Se reutilizan nombre y descripción, quitando únicamente marcadores de cita huérfanos como `[cite: 8, 9, 10]`. Los límites expresos se conservan. No se importan habilidades generales como responsabilidades ni como modificadores.
- `../HABILIDADES GENERALES.docx`: se revisó para distinguir habilidades generales de las exclusivas de personajes; no se agrega ese catálogo a la aplicación.
- `../Hoja de Personaje Editable.pdf` (25/08/2026): plantilla genérica de D&D sin fichas completadas; no aporta valores de los cinco personajes.

## Diferencias y decisiones explícitas

- Filtro de Estandarización: el documento indica **CD 11**, mientras el ejemplo del pedido menciona CD 9. El preset conserva **CD 11**.
- Plan de Acción A3: se conserva el bonus +2 y un uso por partida del documento.
- Kaizen Sprint: el documento dice recuperar días de Lead Time, sin fijar dos días. No se inventa un valor de reducción.
- Cierre de Grifo: la fuente lo denomina habilidad pasiva y usa el **50% del presupuesto**, no un umbral de USD 5.000. Permanece en habilidades; no se duplica como restricción.
- La fuente denomina Visión Sistémica del Búho «Pasiva/Activa». Como el modelo solicitado admite un solo tipo, se clasifica como activa por su intervención ejecutiva limitada a una vez por partida, conservando la descripción. No se crea una segunda habilidad.
- Los tipos normalizados son clasificación de interfaz: A3 y Decreto se clasifican como soporte; Veto como interrupción; Margen de Tolerancia y Auditoría Oculta como revelación. Los efectos siguen siendo texto; no se ejecutan.
- Cuando no se especifica un límite por ronda o partida, el preset deja el límite sin configurar. «Ignora la primera penalización» se conserva en la descripción de Resistencia de Planta, sin inventar un alcance temporal.
- No se encontraron objetivos públicos/secretos ni debilidades o restricciones específicas completas en estas fichas fuente. Los ejemplos del pedido no se convierten en datos canónicos. Esas secciones quedan vacías y configurables; aplicar un preset no sobrescribe los objetivos privados ya escritos en el formulario.

Los presets solo se aplican mediante una selección explícita en el formulario. No se aplican por migración, al consultar una ficha ni al actualizar la aplicación.

## Persistencia y privacidad

`configured_modifiers = NULL` conserva la lectura de las columnas originales de 0027: cada valor no nulo es seleccionado, incluido cero. Una lista vacía significa que el Master eligió no tener modificadores. No hay backfill ni cambios en fichas históricas.

Las listas de modificadores, habilidades, debilidades y restricciones son JSONB validados en servidor y PostgreSQL dentro de cada fila de ficha. Comparten su revisión y guard de preparación. El catálogo de modificadores es personal, inmutable y reutilizable; las fichas guardan copias del nombre/abreviatura/valor para no depender de registros mutables. El servidor autoriza el uso de definiciones del catálogo propio o ya presentes en la ficha.

Co-Master y Observer reciben únicamente las restricciones públicas. Información privada y objetivos secretos no se seleccionan en sus consultas. No existen políticas RLS ni grants directos para `anon` o `authenticated` sobre el nuevo catálogo.
