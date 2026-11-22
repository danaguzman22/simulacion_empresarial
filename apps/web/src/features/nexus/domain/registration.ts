// #6 (D-41 to D-43): registering an institution and resolving registrations. Pure functions, covered by unit tests.
// The same limits are enforced by the database (0034); here they give clear messages before reaching it.
import { PreparationError } from "@/features/preparation/domain/preparation";

export class NexusError extends PreparationError {}

export type InstitutionKind = "educational" | "company" | "other";
export const institutionKindLabels: Record<InstitutionKind, string> = { educational: "Educativa", company: "Empresa", other: "Otra" };
export const registrationStatusLabels = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" } as const;
export const MAX_PENDING_REGISTRATIONS = 3;
export const limits = { name: [2, 160], locality: [2, 120], message: [0, 1000], reason: [3, 1000] } as const;

const isKind = (value: unknown): value is InstitutionKind => value === "educational" || value === "company" || value === "other";
// No HTML: the database rejects "<" and ">" in these public texts too.
const hasHtml = (value: string) => /[<>]/.test(value);

function text(value: unknown, field: keyof typeof limits, label: string) {
  if (value !== undefined && value !== null && typeof value !== "string") throw new NexusError(`${label}: valor inválido.`);
  const clean = String(value ?? "").trim();
  const [min, max] = limits[field];
  if (clean.length < min || clean.length > max) throw new NexusError(min > 0 ? `${label}: entre ${min} y ${max} caracteres.` : `${label}: hasta ${max} caracteres.`);
  if (hasHtml(clean)) throw new NexusError(`${label}: no puede tener los signos < ni >.`);
  return clean;
}

export function validateRegistration(input: { name: unknown; kind: unknown; locality: unknown; message: unknown }) {
  if (!isKind(input.kind)) throw new NexusError("Elegí el tipo de institución.");
  return { name: text(input.name, "name", "Nombre"), kind: input.kind, locality: text(input.locality, "locality", "Localidad"), message: text(input.message, "message", "Mensaje") };
}

export function validateReason(reason: unknown) {
  return text(reason, "reason", "Motivo del rechazo");
}

// D-41: duplicates are compared without upper case, accents or extra spaces ("Córdoba" = "cordoba").
export function normalizeForCompare(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Same name and locality. An existing institution without locality (created before 0034) with the same name also
// counts, because it could be the same one.
export function possibleDuplicate(candidate: { name: string; locality: string }, existing: { name: string; locality: string | null }) {
  if (normalizeForCompare(candidate.name) !== normalizeForCompare(existing.name)) return false;
  return existing.locality === null || normalizeForCompare(candidate.locality) === normalizeForCompare(existing.locality);
}
