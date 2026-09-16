import { normalizeValue, PreparationError } from "@/features/preparation/domain/preparation";

type Definition = Parameters<typeof normalizeValue>[1];

/** Exact decimal addition; no floating point and no implicit zero for missing values. */
export function numericAdd(before: string, rawAmount: string, definition: Definition) {
  if (definition.valueType !== "numeric") throw new PreparationError("Sumar/restar solo admite indicadores numéricos.");
  const amount = normalizeValue(rawAmount.trim().replace(/^\+/, ""), { ...definition, allowsNegative: true });
  const current = normalizeValue(before, definition);
  if (amount === null || current === null) throw new PreparationError("El efecto necesita un valor y un indicador configurado.");
  const scale = Math.max((amount.split(".")[1] ?? "").length, (current.split(".")[1] ?? "").length);
  function integer(value: string) {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    return BigInt(whole + fraction.padEnd(scale, "0")) * (negative ? BigInt(-1) : BigInt(1));
  }
  const sum = integer(current) + integer(amount);
  const digits = (sum < BigInt(0) ? -sum : sum).toString().padStart(scale + 1, "0");
  const result = (sum < BigInt(0) ? "-" : "") + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
  return { amount, before: current, after: normalizeValue(result, definition)! };
}
