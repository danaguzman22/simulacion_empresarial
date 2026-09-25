import { PreparationError } from "@/features/preparation/domain/preparation";
export class RevealError extends PreparationError {}
export type RevealResult = { status: "revealed"; text: string; operationId: string; expiresAt: string; remainingMs: number } | { status: "closed" | "expired" | "exhausted" | "already-open" | "unconfigured" };
export type RevealSummary = { limit: number; durationSeconds: number; used: number; enabled: boolean; configured: boolean };
export function validateRevealConfiguration(limit: number, seconds: number, revision: number) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100 || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600 || !Number.isSafeInteger(revision) || revision < 0) throw new RevealError("Revisá cantidad (0–100), duración (1–3600 segundos) y revisión de la ficha.");
}
