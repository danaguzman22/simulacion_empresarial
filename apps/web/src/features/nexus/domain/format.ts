// Dates of the NEXUS panel: Argentine time, 24 h ("22/11/26, 18:16").
export const dateTime = (value: Date | null) => value
  ? value.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" })
  : "";
