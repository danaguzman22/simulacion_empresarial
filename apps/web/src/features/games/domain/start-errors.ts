// Database checks that can still reject a start (defense in depth). Each one becomes a concrete reason for the
// Master; the generic "No se pudo iniciar" message is never shown for a known database rule.
const known: Array<[RegExp, string]> = [
  [/Start requires at least one goal/, "Metas: cargá al menos una meta o marcá Metas como opcional."],
  [/Start requires at least one enabled rule/, "Reglas: activá al menos una regla o marcá Reglas como opcional."],
  [/Start requires valid enabled rules/, "Reglas: cada regla activa necesita efectos válidos sobre KPIs numéricos con valor inicial."],
  [/A required KPI is missing/, "KPIs: completá todos los KPIs obligatorios."],
  [/Starting game requires period configuration/, "Tiempos: configurá los períodos."],
  [/Starting a game requires|Initial and current must copy preparation|Periods may only be created|Start must create exactly/,
    "La preparación cambió mientras se iniciaba. Recargá los datos y volvé a intentar."],
];

export function startErrorMessage(databaseMessage: string) {
  for (const [pattern, message] of known) if (pattern.test(databaseMessage)) return message;
  return `No se pudo iniciar la partida. Motivo informado por la base: ${databaseMessage}`;
}

// Drizzle wraps the PostgreSQL error; only its message (never the query or its parameters) is used.
export function databaseErrorMessage(error: unknown): string | null {
  const candidate = (error as { cause?: unknown })?.cause ?? error;
  const named = candidate as { name?: unknown; message?: unknown; severity?: unknown };
  return typeof named?.message === "string" && (named.name === "PostgresError" || typeof named.severity === "string") ? named.message : null;
}
