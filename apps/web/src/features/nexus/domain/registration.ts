// #6 (D-41 to D-43): registering an institution in 4 steps and resolving registrations. Pure functions, used by the
// form (each step), the server and the unit tests. The database (0034) enforces the same rules again.
import { PreparationError } from "@/features/preparation/domain/preparation";

export class NexusError extends PreparationError {}

export type InstitutionKind = "educational" | "company" | "public_agency" | "ngo" | "other";
export const institutionKindLabels: Record<InstitutionKind, string> = { educational: "Educativa", company: "Empresa", public_agency: "Organismo público", ngo: "ONG", other: "Otra" };
export const educationLevels = { university: "Universitario", tertiary: "Terciario", secondary: "Secundario", vocational: "Formación profesional", other: "Otro" } as const;
export const companySectors = { technology: "Tecnología", industry: "Industria", commerce: "Comercio", services: "Servicios", finance: "Finanzas y seguros", health: "Salud", agro: "Agro", construction: "Construcción", energy: "Energía", other: "Otro" } as const;
export const companySizes = { "1-10": "1 a 10 personas", "11-50": "11 a 50 personas", "51-200": "51 a 200 personas", "201-1000": "201 a 1000 personas", "1000+": "Más de 1000 personas" } as const;
// D-26: only stored for now; the behavior arrives with #7.
export const organizationKinds = {
  direct: { label: "Directa", help: "La institución tiene sus áreas o materias directamente." },
  branches: { label: "Con sedes", help: "La institución solo organiza sedes; cada sede tiene sus admins y sus áreas o materias." },
} as const;
export const countries = { AR: "Argentina", BO: "Bolivia", BR: "Brasil", CL: "Chile", CO: "Colombia", CR: "Costa Rica", EC: "Ecuador", ES: "España", GT: "Guatemala", MX: "México", PA: "Panamá", PE: "Perú", PY: "Paraguay", US: "Estados Unidos", UY: "Uruguay", VE: "Venezuela" } as const;
export const argentineProvinces = ["Buenos Aires", "Catamarca", "Chaco", "Chubut", "Ciudad Autónoma de Buenos Aires", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"] as const;
export const registrationStatusLabels = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" } as const;
export const MAX_PENDING_REGISTRATIONS = 3;

// Maximum lengths, the same in the database.
export const limits = {
  legalName: [2, 160], displayName: [2, 80], taxId: [3, 40], website: [12, 200], province: [2, 100], locality: [2, 120], postalCode: [3, 12],
  address: [3, 200], email: [6, 254], phone: [6, 30], position: [2, 80], area: [2, 120], contactName: [2, 120], message: [0, 1000], reason: [3, 1000],
} as const;
type Field = keyof typeof limits;

export type RegistrationDraft = {
  legalName: string; displayName: string; kind: string; educationLevel: string; sector: string; companySize: string; organizationKind: string;
  country: string; taxId: string; website: string;
  province: string; locality: string; postalCode: string; address: string;
  institutionalEmail: string; institutionalPhone: string; responsiblePosition: string; responsibleArea: string; responsiblePhone: string;
  alternateName: string; alternatePosition: string; alternateEmail: string; alternatePhone: string; authorized: boolean;
  message: string;
};
export const emptyDraft: RegistrationDraft = {
  legalName: "", displayName: "", kind: "", educationLevel: "", sector: "", companySize: "", organizationKind: "direct",
  country: "AR", taxId: "", website: "", province: "", locality: "", postalCode: "", address: "",
  institutionalEmail: "", institutionalPhone: "", responsiblePosition: "", responsibleArea: "", responsiblePhone: "",
  alternateName: "", alternatePosition: "", alternateEmail: "", alternatePhone: "", authorized: false, message: "",
};
export const draftFields = Object.keys(emptyDraft) as Array<keyof RegistrationDraft>;

// Normalized payload sent to the database (register_institution / nexus_create_institution).
export type RegistrationPayload = {
  legalName: string; displayName: string | null; kind: InstitutionKind; educationLevel: string | null; sector: string | null; companySize: string | null;
  organizationKind: "direct" | "branches"; country: string; taxId: string | null; website: string | null;
  province: string; locality: string; postalCode: string; address: string | null;
  institutionalEmail: string; institutionalPhone: string; responsiblePosition: string; responsibleArea: string; responsiblePhone: string | null;
  alternate: { name: string; position: string | null; email: string | null; phone: string | null } | null; message: string;
};

const has = <T extends object>(map: T, key: unknown): key is keyof T => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

// --- Formats -------------------------------------------------------------------------------------------------
// CUIT (Argentina): 11 digits with its check digit (weights 5,4,3,2,7,6,5,4,3,2; 11 - sum mod 11; 11 -> 0; 10 invalid).
export function validCuit(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, i) => total + weight * Number(digits[i]), 0);
  const rest = 11 - (sum % 11), check = rest === 11 ? 0 : rest;
  return rest !== 10 && check === Number(digits[10]);
}
// Stored form of a tax id: CUIT as 11 digits; other countries in upper case without spaces.
export function normalizeTaxId(country: string, value: string) {
  return country === "AR" ? value.replace(/[\s-]/g, "") : value.replace(/\s+/g, "").toUpperCase();
}
export const validEmail = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export const validPhone = (value: string) => /^\+?[0-9 ()-]+$/.test(value) && value.replace(/\D/g, "").length >= 6;
export const validWebsite = (value: string) => /^https:\/\/[^\s<>"']+\.[^\s<>"']+$/.test(value);

// --- Validation by step ---------------------------------------------------------------------------------------
export type StepErrors = Partial<Record<keyof RegistrationDraft, string>>;
function text(errors: StepErrors, key: keyof RegistrationDraft, value: string, field: Field, label: string, required: boolean) {
  const [min, max] = limits[field];
  if (!value) { if (required) errors[key] = `${label}: obligatorio.`; return; }
  if (/[<>]/.test(value)) errors[key] = `${label}: no puede tener los signos < ni >.`;
  else if (value.length < min || value.length > max) errors[key] = `${label}: entre ${min} y ${max} caracteres.`;
}

export function validateStep(step: 1 | 2 | 3 | 4, draft: RegistrationDraft): StepErrors {
  const errors: StepErrors = {}, d = Object.fromEntries(draftFields.map(k => [k, typeof draft[k] === "string" ? clean(draft[k]) : draft[k]])) as RegistrationDraft;
  if (step === 1) {
    text(errors, "legalName", d.legalName, "legalName", "Nombre legal o razón social", true);
    text(errors, "displayName", d.displayName, "displayName", "Nombre visible", false);
    if (!has(institutionKindLabels, d.kind)) errors.kind = "Elegí el tipo de institución.";
    if (d.kind === "educational" && !has(educationLevels, d.educationLevel)) errors.educationLevel = "Elegí el nivel educativo.";
    if (d.kind === "company" && !has(companySectors, d.sector)) errors.sector = "Elegí el rubro.";
    if (d.kind === "company" && !has(companySizes, d.companySize)) errors.companySize = "Elegí el tamaño.";
    if (!has(organizationKinds, d.organizationKind)) errors.organizationKind = "Elegí el tipo de organización.";
    if (!has(countries, d.country)) errors.country = "Elegí el país.";
    if (d.taxId) {
      if (d.country === "AR") { if (!validCuit(d.taxId)) errors.taxId = "CUIT inválido: revisá los 11 números y el dígito verificador."; }
      else text(errors, "taxId", d.taxId, "taxId", "Identificación fiscal", false);
    }
    if (d.website && (!validWebsite(d.website) || d.website.length > limits.website[1])) errors.website = "Sitio web: tiene que empezar con https:// (hasta 200 caracteres).";
  }
  if (step === 2) {
    if (!has(countries, d.country)) errors.country = "Elegí el país.";
    if (d.country === "AR") { if (!(argentineProvinces as readonly string[]).includes(d.province)) errors.province = "Elegí la provincia."; }
    else text(errors, "province", d.province, "province", "Provincia o estado", true);
    text(errors, "locality", d.locality, "locality", "Localidad", true);
    text(errors, "postalCode", d.postalCode, "postalCode", "Código postal", true);
    text(errors, "address", d.address, "address", "Dirección", false);
  }
  if (step === 3) {
    if (!validEmail(d.institutionalEmail) || d.institutionalEmail.length > limits.email[1]) errors.institutionalEmail = "Correo institucional: obligatorio y válido.";
    if (!validPhone(d.institutionalPhone) || d.institutionalPhone.length > limits.phone[1]) errors.institutionalPhone = "Teléfono institucional: obligatorio (solo números, espacios, + - y paréntesis).";
    text(errors, "responsiblePosition", d.responsiblePosition, "position", "Cargo", true);
    text(errors, "responsibleArea", d.responsibleArea, "area", "Área o dependencia", true);
    if (d.responsiblePhone && (!validPhone(d.responsiblePhone) || d.responsiblePhone.length > limits.phone[1])) errors.responsiblePhone = "Teléfono: solo números, espacios, + - y paréntesis.";
    const alternate = d.alternateName || d.alternatePosition || d.alternateEmail || d.alternatePhone;
    if (alternate) {
      text(errors, "alternateName", d.alternateName, "contactName", "Nombre del contacto alternativo", true);
      text(errors, "alternatePosition", d.alternatePosition, "position", "Cargo del contacto alternativo", false);
      if (d.alternateEmail && (!validEmail(d.alternateEmail) || d.alternateEmail.length > limits.email[1])) errors.alternateEmail = "Correo del contacto alternativo: no es válido.";
      if (d.alternatePhone && (!validPhone(d.alternatePhone) || d.alternatePhone.length > limits.phone[1])) errors.alternatePhone = "Teléfono del contacto alternativo: no es válido.";
      if (!d.alternateEmail && !d.alternatePhone) errors.alternateEmail = "Contacto alternativo: cargá un correo o un teléfono.";
    }
    if (draft.authorized !== true) errors.authorized = "Tenés que declarar que estás autorizado/a a registrar esta institución.";
  }
  if (step === 4) text(errors, "message", d.message, "message", "Mensaje", false);
  return errors;
}

// Whole draft -> normalized payload, or the first error (server side; the form shows every error of the step).
export function validateRegistration(raw: Partial<Record<keyof RegistrationDraft, unknown>>): RegistrationPayload {
  const draft = { ...emptyDraft, ...Object.fromEntries(draftFields.map(k => [k, k === "authorized" ? raw[k] === true || raw[k] === "yes" : clean(raw[k])])) } as RegistrationDraft;
  for (const step of [1, 2, 3, 4] as const) {
    const errors = Object.values(validateStep(step, draft));
    if (errors.length) throw new NexusError(errors[0] as string);
  }
  const d = draft, none = (v: string) => v || null, alternate = d.alternateName || d.alternateEmail || d.alternatePhone;
  return {
    legalName: d.legalName, displayName: none(d.displayName), kind: d.kind as InstitutionKind,
    educationLevel: d.kind === "educational" ? d.educationLevel : null, sector: d.kind === "company" ? d.sector : null, companySize: d.kind === "company" ? d.companySize : null,
    organizationKind: d.organizationKind as "direct" | "branches", country: d.country, taxId: d.taxId ? normalizeTaxId(d.country, d.taxId) : null, website: none(d.website),
    province: d.province, locality: d.locality, postalCode: d.postalCode, address: none(d.address),
    institutionalEmail: d.institutionalEmail.toLowerCase(), institutionalPhone: d.institutionalPhone, responsiblePosition: d.responsiblePosition, responsibleArea: d.responsibleArea,
    responsiblePhone: none(d.responsiblePhone),
    alternate: alternate ? { name: d.alternateName, position: none(d.alternatePosition), email: d.alternateEmail ? d.alternateEmail.toLowerCase() : null, phone: none(d.alternatePhone) } : null,
    message: d.message,
  };
}

export function validateReason(reason: unknown) {
  const value = clean(reason), [min, max] = limits.reason;
  if (value.length < min || value.length > max) throw new NexusError(`Motivo: entre ${min} y ${max} caracteres.`);
  if (/[<>]/.test(value)) throw new NexusError("Motivo: no puede tener los signos < ni >.");
  return value;
}

// --- Uniqueness (D-41) ----------------------------------------------------------------------------------------
// Legal name + country + province + locality, compared without upper case, accents or extra spaces. Exactly the
// same mapping as public.normalize_institution_text in the database (0034).
const accents = "ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç", plain = "AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc";
export function normalizeForCompare(value: string | null) {
  return [...(value ?? "")].map(c => { const i = accents.indexOf(c); return i < 0 ? c : plain[i]; }).join("").toLowerCase().replace(/\s+/g, " ").trim();
}
type Place = { legalName: string | null; country: string | null; province: string | null; locality: string | null };
export function samePlaceAndName(a: Place, b: Place) {
  return !!a.legalName && !!b.legalName && ["legalName", "country", "province", "locality"].every(k => normalizeForCompare(a[k as keyof Place]) === normalizeForCompare(b[k as keyof Place]));
}
export const DUPLICATE_MESSAGE = "Ya existe una institución con ese nombre en esa localidad.";
export const DUPLICATE_TAX_ID_MESSAGE = "Ya hay una institución registrada con ese CUIT o identificación fiscal.";
