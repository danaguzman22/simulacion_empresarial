import { remainingMilliseconds } from "@/features/rounds/domain/round";
export type ClockPeriod = { status: string; endsAt: string | null; remainingMs: number | null };
// Period closing is lazy: after its end time the server can still report the period as active.
// Ask for one refresh per expired end time; after that the regular 15-second refresh takes over.
export function shouldRefreshOnExpiry(period: ClockPeriod | null, now: number, refreshedEndsAt: string | null) {
  if (!period || period.status !== "active" || !period.endsAt) return false;
  return remainingMilliseconds(period, now) <= 0 && period.endsAt !== refreshedEndsAt;
}
