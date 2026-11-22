"use server";
import { loadDashboard } from "./get-dashboard";

// Auto-refresh from the browser: same access checks as the first render, on every call.
export async function getDashboard(gameId: string) {
  return loadDashboard(gameId);
}
