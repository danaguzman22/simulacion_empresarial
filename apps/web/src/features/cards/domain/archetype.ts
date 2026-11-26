// #106 / D-46: the five NEXUS archetypes are part of the system. Each one has its drawing and its color; a card
// without archetype ("ninguno") uses its visual identity (emoji) and a color derived from its department.
export const archetypes = ["buho", "zorro", "castor", "toro", "ardilla", "ninguno"] as const;
export type Archetype = typeof archetypes[number];

export const archetypeInfo: Record<Exclude<Archetype, "ninguno">, { label: string; emoji: string; color: string }> = {
  // Prototype palette (dark theme), readable on the dashboard's slate background.
  buho: { label: "Búho", emoji: "🦉", color: "#5f92e0" },
  zorro: { label: "Zorro", emoji: "🦊", color: "#ef8f4e" },
  castor: { label: "Castor", emoji: "🦫", color: "#45b189" },
  toro: { label: "Toro", emoji: "🐂", color: "#e05f5f" },
  ardilla: { label: "Ardilla", emoji: "🐿️", color: "#e6b23c" },
};
export const archetypeLabels: Record<Archetype, string> = { ...Object.fromEntries(Object.entries(archetypeInfo).map(([k, v]) => [k, v.label])), ninguno: "Ninguno" } as Record<Archetype, string>;

export function isArchetype(value: unknown): value is Archetype {
  return typeof value === "string" && (archetypes as readonly string[]).includes(value);
}

// Fixed palette of 8 for cards without archetype, distinct from the five archetype colors.
export const departmentPalette = ["#38bdf8", "#a78bfa", "#2dd4bf", "#f472b6", "#a3e635", "#fb923c", "#c084fc", "#facc15"] as const;

// Same department name, same color everywhere (campaign, game, participant): case, accents and spaces do not matter.
export function departmentColor(department: string) {
  const key = department.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return departmentPalette[hash % departmentPalette.length];
}

export function cardAccent(card: { archetype?: Archetype | null; department: string }) {
  return card.archetype && card.archetype !== "ninguno" ? archetypeInfo[card.archetype].color : departmentColor(card.department);
}

// Cards created before 0035 have no archetype (null). It is deduced only from the exact visual identity a NEXUS
// template writes ("El Búho"…) or its emoji alone; case and extra spaces do not matter. Anything else is "ninguno".
// Same rule as database/preflight/0035.sql.
const templateIdentities: Record<string, Exclude<Archetype, "ninguno">> = {
  "el búho": "buho", "🦉": "buho", "el zorro": "zorro", "🦊": "zorro", "el castor": "castor", "🦫": "castor",
  "el toro": "toro", "🐂": "toro", "la ardilla": "ardilla", "🐿️": "ardilla", "🐿": "ardilla",
};
export function resolveArchetype(archetype: string | null | undefined, visualIdentity: string): Archetype {
  if (isArchetype(archetype)) return archetype;
  return templateIdentities[visualIdentity.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()] ?? "ninguno";
}
