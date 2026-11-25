// #72: who is signed in, with which generic role label, and which institution is active.
// Pure functions (no database, no cookies), covered by unit tests.

// D-38: generic labels. People who play can be students or employees, so the interface never says "Alumno".
export type SessionArea = "participant" | "panel" | "admin" | "nexus";
export type InstitutionRole = "admin" | "teacher" | "member";
export type CampaignRole = "master" | "co_master" | "observer";
export type Membership = { id: string; name: string; role: InstitutionRole };

export const campaignRoleLabels: Record<CampaignRole, string> = { master: "Master", co_master: "Co-Master", observer: "Observador" };
const campaignRoleRank: Record<CampaignRole, number> = { master: 0, co_master: 1, observer: 2 };

// The name the person gave; without one, the e-mail.
export function personName(displayName: string | null | undefined, email: string | null | undefined) {
  return displayName?.trim() || email?.trim() || "Sin nombre";
}

// The most important campaign role among several (Master before Co-Master before Observador).
export function bestCampaignRole(roles: CampaignRole[]): CampaignRole | null {
  return roles.reduce<CampaignRole | null>((best, role) => best === null || campaignRoleRank[role] < campaignRoleRank[best] ? role : best, null);
}

// Label next to the name, depending on the screen:
// - participant portal: "Participante";
// - administrative panel: "Docente" when teaching in the active institution, otherwise the campaign role on that
//   screen (or the best one the person has), "Administrador" for an institution admin without campaigns;
// - institution screens: "Administrador" for an admin of the active institution, otherwise "Participante";
// - NEXUS administration (#6): "Administrador de NEXUS" (only NEXUS admins reach it).
export function roleLabel(input: { area: SessionArea; active: Membership | null; campaignRole?: CampaignRole | null; bestRole?: CampaignRole | null }) {
  if (input.area === "participant") return "Participante";
  if (input.area === "nexus") return "Administrador de NEXUS";
  if (input.area === "admin") return input.active?.role === "admin" ? "Administrador" : "Participante";
  if (input.active?.role === "teacher") return "Docente";
  const role = input.campaignRole ?? input.bestRole ?? null;
  if (role) return campaignRoleLabels[role];
  return input.active?.role === "admin" ? "Administrador" : "Master";
}

// D-39: the cookie only CHOOSES among the person's active memberships; it never grants access.
// A cookie with a foreign, revoked or malformed id is ignored and the first institution (by name) is used.
export const ACTIVE_INSTITUTION_COOKIE = "nexus-institution";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);

export function pickActiveInstitution(memberships: Membership[], cookieValue: string | null | undefined): Membership | null {
  if (isUuid(cookieValue)) {
    const chosen = memberships.find(m => m.id.toLowerCase() === cookieValue.toLowerCase());
    if (chosen) return chosen;
  }
  return memberships[0] ?? null;
}

// Where to go after choosing another institution: the home of the same area (lists change with the institution).
export const areaHome: Record<SessionArea, string> = { participant: "/alumno", panel: "/master", admin: "/instituciones", nexus: "/nexus" };
export const isSessionArea = (value: unknown): value is SessionArea => value === "participant" || value === "panel" || value === "admin" || value === "nexus";

// "Ir a" in the user menu: every area the person can use, in a fixed order. Each flag comes from the server
// (readAreaAccess); "Mis instituciones" is always available. "Administración" (units, #7) joins when it exists.
export type AreaAccess = { participant: boolean; panel: boolean; nexus: boolean };
export const areaLabels: Record<SessionArea, string> = { participant: "Mis partidas", panel: "Panel", admin: "Mis instituciones", nexus: "Administración de NEXUS" };
export function availableAreas(access: AreaAccess): { area: SessionArea; label: string; href: string }[] {
  const order: SessionArea[] = ["participant", "panel", "admin", "nexus"];
  return order.filter(area => area === "admin" || access[area]).map(area => ({ area, label: areaLabels[area], href: areaHome[area] }));
}
