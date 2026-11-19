// Who reads the game dashboard (#32). Staff: Master, Co-Master and Observer of the campaign; they may also open the
// projection window. Participant: a person with a card assigned in the game, from the moment the game started.
export type DashboardViewer = "staff" | "participant";

export const DASHBOARD_REFRESH_MS = 5000;

export function canProjectDashboard(viewer: DashboardViewer) {
  return viewer === "staff";
}

export function isStaffRole(role: string) {
  return role === "master" || role === "co_master" || role === "observer";
}
