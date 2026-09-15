import { RoundError } from "./round";
export type PeriodConfiguration = { count: number; label: string; durationSeconds: number };
export function validatePeriodConfiguration(input: PeriodConfiguration) {
 if (!Number.isInteger(input.count) || input.count < 1 || input.count > 2147483647) throw new RoundError("La cantidad debe ser un entero positivo.");
 if (!input.label.trim() || input.label.trim().length > 80) throw new RoundError("Ingresá un nombre de hasta 80 caracteres.");
 if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 2147483647) throw new RoundError("La duración debe ser positiva y representable en segundos.");
 return { ...input, label: input.label.trim() };
}
export function parsePeriodConfiguration(count: string, label: string, minutes: string, seconds: string) {
 if (![count, minutes, seconds].every(v => /^\d+$/.test(v)) || Number(seconds) > 59) throw new RoundError("Usá minutos enteros no negativos y segundos entre 0 y 59.");
 return validatePeriodConfiguration({ count: Number(count), label, durationSeconds: Number(minutes) * 60 + Number(seconds) });
}
