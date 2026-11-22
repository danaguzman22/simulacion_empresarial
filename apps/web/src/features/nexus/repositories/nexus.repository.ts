import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { institutionContacts as contacts, institutionMembers as members, institutionRegistrations as registrations, institutions, nexusAdminActions as actions, nexusAdmins, profiles } from "@/db/schema";
import { isUuid } from "@/features/session/domain/session";
import { DUPLICATE_MESSAGE, DUPLICATE_TAX_ID_MESSAGE, MAX_PENDING_REGISTRATIONS, NexusError, normalizeForCompare, samePlaceAndName, validateReason, validateRegistration,
  type RegistrationDraft, type RegistrationPayload } from "../domain/registration";

// #6: every write goes through the SECURITY DEFINER functions of 0034, which re-check the rules in the database.
// Here the server checks first (signed-in person, NEXUS admin, valid input) and turns database errors into Spanish.
const REMOVED_BY_INSTITUTION = "Esta persona fue dada de baja por la institución: la institución tiene que volver a sumarla.";
const databaseMessages: Array<[RegExp, string]> = [
  [/already exists in that locality|name_place_unique/, DUPLICATE_MESSAGE],
  [/tax id already exists|tax_id_unique/, DUPLICATE_TAX_ID_MESSAGE],
  [/Invalid CUIT/, "CUIT inválido: revisá los 11 números y el dígito verificador."],
  [/At most 3 pending/, `Ya tenés ${MAX_PENDING_REGISTRATIONS} solicitudes de institución pendientes. Esperá a que se resuelvan.`],
  [/no longer pending/, "La solicitud ya fue resuelta. Recargá la página."],
  [/Cannot revoke the last NEXUS admin/, "No se puede quitar el rol al último admin de NEXUS."],
  [/Only an active NEXUS admin/, "Necesitás ser admin de NEXUS."],
  [/nexus_admins_active_unique/, "Esa persona ya es admin de NEXUS."],
  [/not an active NEXUS admin/, "Esa persona ya no es admin de NEXUS."],
  [/already an admin of this institution/, "Esa persona ya es admin de esta institución."],
  [/removed by the institution/, REMOVED_BY_INSTITUTION],
  [/reason between 3 and 1000/, "Motivo: entre 3 y 1000 caracteres."],
];
async function translated<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const text = [error instanceof Error ? error.message : "", (error as { cause?: { message?: string } })?.cause?.message ?? ""].join(" ");
    const known = databaseMessages.find(([pattern]) => pattern.test(text));
    if (known) throw new NexusError(known[1]);
    throw error;
  }
}
const readOnly = { isolationLevel: "repeatable read", accessMode: "read only" } as const;
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function isNexusAdmin(actor: string) {
  const [row] = await db.execute<{ ok: boolean }>(sql`select public.is_nexus_admin(${actor}::uuid) as ok`);
  return row?.ok === true;
}
async function requireNexusAdmin(actor: string) {
  if (!await isNexusAdmin(actor)) throw new NexusError("Necesitás ser admin de NEXUS.");
}
async function profileByEmail(executor: Executor, email: unknown) {
  const clean = typeof email === "string" ? email.trim() : "";
  if (!clean || clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new NexusError("Ingresá el correo de una cuenta registrada.");
  const found = await executor.execute<{ profile_id: string }>(sql`select profile_id from public.find_registered_profile_by_email(${clean})`);
  if (found.length !== 1) throw new NexusError("No hay ninguna cuenta registrada con ese correo.");
  return { profileId: String(found[0].profile_id), email: clean.toLowerCase() };
}

// D-41: legal name + country + province + locality unique among institutions and pending registrations, and the tax
// id unique when present (the database checks both too). Never says who registered the other one.
async function checkUnique(executor: Executor, input: RegistrationPayload) {
  const existing = await executor.select({ legalName: institutions.legalName, country: institutions.country, province: institutions.province, locality: institutions.locality, taxId: institutions.taxId }).from(institutions);
  const waiting = await executor.select({ legalName: registrations.name, country: registrations.country, province: registrations.province, locality: registrations.locality, taxId: registrations.taxId })
    .from(registrations).where(eq(registrations.status, "pending"));
  const others = [...existing, ...waiting];
  if (others.some(other => samePlaceAndName(input, other))) throw new NexusError(DUPLICATE_MESSAGE);
  if (input.taxId && others.some(other => other.taxId === input.taxId)) throw new NexusError(DUPLICATE_TAX_ID_MESSAGE);
}

// Any signed-in person registers an institution; it waits for a NEXUS admin. actorEmail is the e-mail of the
// person's account (from the verified session), stored as the responsible contact.
export async function registerInstitution(actor: string, actorEmail: string, raw: Partial<Record<keyof RegistrationDraft, unknown>>) {
  const input = validateRegistration(raw);
  await translated(() => db.transaction(async tx => {
    const [{ pending }] = await tx.select({ pending: count() }).from(registrations).where(and(eq(registrations.profileId, actor), eq(registrations.status, "pending")));
    if (pending >= MAX_PENDING_REGISTRATIONS) throw new NexusError(`Ya tenés ${MAX_PENDING_REGISTRATIONS} solicitudes de institución pendientes. Esperá a que se resuelvan.`);
    await checkUnique(tx, input);
    await tx.execute(sql`select public.register_institution(${actor}::uuid, ${actorEmail}, ${JSON.stringify(input)}::text::jsonb)`);
  }));
}

// D-43: a NEXUS admin creates an institution asked for by phone or e-mail, for a registered person who becomes its
// main admin. Registration + approval in one transaction, recorded as "creada por el admin de NEXUS".
export async function nexusCreateInstitution(actor: string, raw: Partial<Record<keyof RegistrationDraft, unknown>>, adminEmail: unknown) {
  const input = validateRegistration(raw);
  await requireNexusAdmin(actor);
  return translated(() => db.transaction(async tx => {
    const person = await profileByEmail(tx, adminEmail);
    await checkUnique(tx, input);
    const [row] = await tx.execute<{ id: string }>(sql`select public.nexus_create_institution(${actor}::uuid, ${person.profileId}::uuid, ${person.email}, ${JSON.stringify(input)}::text::jsonb) as id`);
    return String(row.id);
  }));
}

// "Mis solicitudes": the person's own registrations, with the rejection reason (D-43).
export async function myRegistrations(actor: string) {
  return db.select({ id: registrations.id, name: registrations.name, displayName: registrations.displayName, locality: registrations.locality, province: registrations.province,
    status: registrations.status, rejectionReason: registrations.rejectionReason, requestedAt: registrations.requestedAt, resolvedAt: registrations.resolvedAt, createdByNexus: registrations.createdByNexus })
    .from(registrations).where(eq(registrations.profileId, actor)).orderBy(desc(registrations.requestedAt), asc(registrations.id));
}

// ---- NEXUS panel (D-44: one read per section). Each returns null for anyone who is not an active NEXUS admin. ----
export async function readPendingCount(actor: string) {
  if (!await isNexusAdmin(actor)) return null;
  const [{ n }] = await db.select({ n: count() }).from(registrations).where(eq(registrations.status, "pending"));
  return n;
}

const registrationColumns = {
  id: registrations.id, name: registrations.name, displayName: registrations.displayName, kind: registrations.type, educationLevel: registrations.educationLevel,
  sector: registrations.sector, companySize: registrations.companySize, organizationKind: registrations.organizationKind, taxId: registrations.taxId, website: registrations.website,
  country: registrations.country, province: registrations.province, locality: registrations.locality, postalCode: registrations.postalCode, address: registrations.address,
  message: registrations.message, status: registrations.status, requestedAt: registrations.requestedAt, resolvedAt: registrations.resolvedAt, rejectionReason: registrations.rejectionReason,
  authorizedAt: registrations.authorizedAt, createdByNexus: registrations.createdByNexus, institutionId: registrations.institutionId, profileId: registrations.profileId,
};
async function contactsOf(executor: Executor, where: SQL) {
  return executor.select({ id: contacts.id, registrationId: contacts.registrationId, kind: contacts.kind, name: sql<string | null>`coalesce(${contacts.name}, ${profiles.displayName})`,
    position: contacts.position, area: contacts.area, email: contacts.email, phone: contacts.phone })
    .from(contacts).leftJoin(profiles, eq(profiles.id, contacts.profileId)).where(where).orderBy(asc(contacts.kind), asc(contacts.createdAt));
}

export async function readPendingRegistrations(actor: string) {
  if (!await isNexusAdmin(actor)) return null;
  const registrant = alias(profiles, "registrant");
  return db.transaction(async tx => {
    const rows = await tx.select({ ...registrationColumns, registrant: registrant.displayName }).from(registrations).innerJoin(registrant, eq(registrant.id, registrations.profileId))
      .where(eq(registrations.status, "pending")).orderBy(asc(registrations.requestedAt), asc(registrations.id));
    const all = rows.length ? await contactsOf(tx, inArray(contacts.registrationId, rows.map(r => r.id))) : [];
    return rows.map(r => ({ ...r, contacts: all.filter(c => c.registrationId === r.id) }));
  }, readOnly);
}

// Every institution, with an optional search by name or locality (accents and case ignored). The counts come from a
// grouped query: a correlated subquery with an unqualified "id" counted the wrong table (bug fixed, see the test).
export async function readInstitutions(actor: string, search: string) {
  if (!await isNexusAdmin(actor)) return null;
  const q = normalizeForCompare(search.slice(0, 160));
  return db.transaction(async tx => {
    const rows = await tx.select({ id: institutions.id, name: institutions.name, legalName: institutions.legalName, kind: institutions.type, locality: institutions.locality,
      province: institutions.province, createdAt: institutions.createdAt }).from(institutions).orderBy(asc(institutions.name), asc(institutions.id));
    const counts = await tx.select({ institutionId: members.institutionId, members: count(), admins: sql<number>`(count(*) filter (where ${members.role} = 'admin'))::int` })
      .from(members).where(eq(members.status, "active")).groupBy(members.institutionId);
    const byId = new Map(counts.map(c => [c.institutionId, c]));
    const list = rows.map(r => ({ ...r, members: byId.get(r.id)?.members ?? 0, admins: byId.get(r.id)?.admins ?? 0 }));
    return q.length >= 2 ? list.filter(r => [r.name, r.legalName, r.locality, r.province].some(v => normalizeForCompare(v).includes(q))) : list;
  }, readOnly);
}

// Detail of one institution for a NEXUS admin: all its data, contacts, admins and its actions.
export async function readInstitutionForNexus(actor: string, institutionId: unknown) {
  if (!isUuid(institutionId) || !await isNexusAdmin(actor)) return null;
  const actor_ = alias(profiles, "actor"), target = alias(profiles, "target");
  return db.transaction(async tx => {
    const [institution] = await tx.select().from(institutions).where(eq(institutions.id, institutionId));
    if (!institution) return null;
    const [registration] = await tx.select({ id: registrations.id, createdByNexus: registrations.createdByNexus, requestedAt: registrations.requestedAt })
      .from(registrations).where(eq(registrations.institutionId, institutionId));
    const admins = await tx.select({ profileId: members.profileId, name: profiles.displayName, since: members.createdAt }).from(members)
      .innerJoin(profiles, eq(profiles.id, members.profileId))
      .where(and(eq(members.institutionId, institutionId), eq(members.role, "admin"), eq(members.status, "active"))).orderBy(asc(profiles.displayName));
    const [{ n: memberCount }] = await tx.select({ n: count() }).from(members).where(and(eq(members.institutionId, institutionId), eq(members.status, "active")));
    const history = await tx.select({ id: actions.id, action: actions.action, createdAt: actions.createdAt, actor: actor_.displayName, target: target.displayName, details: actions.details })
      .from(actions).leftJoin(actor_, eq(actor_.id, actions.actorId)).leftJoin(target, eq(target.id, actions.targetProfileId))
      .where(or(eq(actions.institutionId, institutionId), registration ? eq(actions.registrationId, registration.id) : sql`false`)).orderBy(desc(actions.createdAt), desc(actions.id));
    return { institution, registration: registration ?? null, admins, memberCount, contacts: await contactsOf(tx, eq(contacts.institutionId, institutionId)), history };
  }, readOnly);
}

// Contacts of an institution for its own admins (or a NEXUS admin): private data, never in public listings (D-41).
export async function readInstitutionContacts(actor: string, institutionId: unknown) {
  if (!isUuid(institutionId)) return null;
  const [admin] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.institutionId, institutionId), eq(members.profileId, actor), eq(members.role, "admin"), eq(members.status, "active")));
  if (!admin && !await isNexusAdmin(actor)) return null;
  return contactsOf(db, eq(contacts.institutionId, institutionId));
}

export async function readNexusAdmins(actor: string) {
  if (!await isNexusAdmin(actor)) return null;
  const granter = alias(profiles, "granter");
  const admins = await db.select({ profileId: nexusAdmins.profileId, name: profiles.displayName, grantedAt: nexusAdmins.grantedAt, grantedBy: granter.displayName })
    .from(nexusAdmins).innerJoin(profiles, eq(profiles.id, nexusAdmins.profileId)).leftJoin(granter, eq(granter.id, nexusAdmins.grantedBy))
    .where(isNull(nexusAdmins.revokedAt)).orderBy(asc(profiles.displayName), asc(nexusAdmins.profileId));
  return { admins, self: actor };
}

export const HISTORY_PAGE_SIZE = 20, ACTIONS_PAGE_SIZE = 30;
export type HistoryFilter = "all" | "approved" | "rejected" | "nexus";
export const isHistoryFilter = (value: unknown): value is HistoryFilter => value === "all" || value === "approved" || value === "rejected" || value === "nexus";
const pageNumber = (value: number) => Number.isInteger(value) && value > 0 && value < 100000 ? value : 1;

// Resolved registrations (search by name or locality, filter, pages) and the general record of actions (pages).
export async function readNexusHistory(actor: string, options: { search: string; filter: HistoryFilter; page: number; actionsPage: number }) {
  if (!await isNexusAdmin(actor)) return null;
  const registrant = alias(profiles, "registrant"), resolver = alias(profiles, "resolver"), actor_ = alias(profiles, "actor"), target = alias(profiles, "target");
  const search = options.search.trim().slice(0, 160).replace(/[\\%_]/g, "\\$&"), resolvedPage = pageNumber(options.page), actionsPage = pageNumber(options.actionsPage);
  const conditions: SQL[] = [isNotNull(registrations.resolvedAt)];
  if (options.filter === "approved") conditions.push(and(eq(registrations.status, "approved"), eq(registrations.createdByNexus, false)) as SQL);
  if (options.filter === "rejected") conditions.push(eq(registrations.status, "rejected"));
  if (options.filter === "nexus") conditions.push(eq(registrations.createdByNexus, true));
  if (search.length >= 2) conditions.push(or(ilike(registrations.name, `%${search}%`), ilike(registrations.displayName, `%${search}%`), ilike(registrations.locality, `%${search}%`)) as SQL);
  return db.transaction(async tx => {
    const [{ total }] = await tx.select({ total: count() }).from(registrations).where(and(...conditions));
    const resolved = await tx.select({ id: registrations.id, name: registrations.name, displayName: registrations.displayName, locality: registrations.locality, status: registrations.status,
      createdByNexus: registrations.createdByNexus, rejectionReason: registrations.rejectionReason, resolvedAt: registrations.resolvedAt, registrant: registrant.displayName, resolver: resolver.displayName })
      .from(registrations).innerJoin(registrant, eq(registrant.id, registrations.profileId)).leftJoin(resolver, eq(resolver.id, registrations.resolvedBy))
      .where(and(...conditions)).orderBy(desc(registrations.resolvedAt), asc(registrations.id)).limit(HISTORY_PAGE_SIZE).offset((resolvedPage - 1) * HISTORY_PAGE_SIZE);
    const [{ actionsTotal }] = await tx.select({ actionsTotal: count() }).from(actions);
    const actionsLog = await tx.select({ id: actions.id, action: actions.action, createdAt: actions.createdAt, actor: actor_.displayName, target: target.displayName,
      registration: registrations.name, institution: institutions.name }).from(actions)
      .leftJoin(actor_, eq(actor_.id, actions.actorId)).leftJoin(target, eq(target.id, actions.targetProfileId))
      .leftJoin(registrations, eq(registrations.id, actions.registrationId)).leftJoin(institutions, eq(institutions.id, actions.institutionId))
      .orderBy(desc(actions.createdAt), desc(actions.id)).limit(ACTIONS_PAGE_SIZE).offset((actionsPage - 1) * ACTIONS_PAGE_SIZE);
    return { resolved, total, page: resolvedPage, pages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
      actions: actionsLog, actionsPage, actionsPages: Math.max(1, Math.ceil(actionsTotal / ACTIONS_PAGE_SIZE)) };
  }, readOnly);
}

// One registration with all its data, its contacts and every action about it (registration, approval or rejection,
// admins added later to its institution).
export async function readRegistrationForNexus(actor: string, registrationId: unknown) {
  if (!isUuid(registrationId) || !await isNexusAdmin(actor)) return null;
  const registrant = alias(profiles, "registrant"), resolver = alias(profiles, "resolver"), creator = alias(profiles, "creator"), actor_ = alias(profiles, "actor"), target = alias(profiles, "target");
  return db.transaction(async tx => {
    const [registration] = await tx.select({ ...registrationColumns, registrant: registrant.displayName, resolver: resolver.displayName, creator: creator.displayName })
      .from(registrations).innerJoin(registrant, eq(registrant.id, registrations.profileId)).leftJoin(resolver, eq(resolver.id, registrations.resolvedBy))
      .leftJoin(creator, eq(creator.id, registrations.createdBy)).where(eq(registrations.id, registrationId));
    if (!registration) return null;
    const history = await tx.select({ id: actions.id, action: actions.action, createdAt: actions.createdAt, actor: actor_.displayName, target: target.displayName, details: actions.details })
      .from(actions).leftJoin(actor_, eq(actor_.id, actions.actorId)).leftJoin(target, eq(target.id, actions.targetProfileId))
      .where(or(eq(actions.registrationId, registrationId), registration.institutionId ? eq(actions.institutionId, registration.institutionId) : sql`false`))
      .orderBy(asc(actions.createdAt), asc(actions.id));
    return { registration, contacts: await contactsOf(tx, eq(contacts.registrationId, registrationId)), history };
  }, readOnly);
}

export async function approveRegistration(actor: string, registrationId: unknown) {
  if (!isUuid(registrationId)) throw new NexusError("Solicitud inválida.");
  await requireNexusAdmin(actor);
  await translated(() => db.execute(sql`select public.approve_institution_registration(${actor}::uuid, ${registrationId}::uuid)`));
}

export async function rejectRegistration(actor: string, registrationId: unknown, reason: unknown) {
  if (!isUuid(registrationId)) throw new NexusError("Solicitud inválida.");
  const clean = validateReason(reason);
  await requireNexusAdmin(actor);
  await translated(() => db.execute(sql`select public.reject_institution_registration(${actor}::uuid, ${registrationId}::uuid, ${clean})`));
}

// D-43: a NEXUS admin adds an admin to an institution, with a required reason. It can never remove admins, nor bring
// back someone the institution removed.
export async function addInstitutionAdmin(actor: string, institutionId: unknown, email: unknown, reason: unknown) {
  if (!isUuid(institutionId)) throw new NexusError("Institución inválida.");
  const clean = validateReason(reason);
  await requireNexusAdmin(actor);
  await translated(() => db.transaction(async tx => {
    const person = await profileByEmail(tx, email);
    // Never someone the institution removed (revoked): the institution has to add them again (the database checks it too).
    const [membership] = await tx.select({ status: members.status }).from(members).where(and(eq(members.institutionId, institutionId), eq(members.profileId, person.profileId)));
    if (membership?.status === "revoked") throw new NexusError(REMOVED_BY_INSTITUTION);
    await tx.execute(sql`select public.nexus_add_institution_admin(${actor}::uuid, ${institutionId}::uuid, ${person.profileId}::uuid, ${clean})`);
  }));
}

// D-42: only a NEXUS admin names another one, by the e-mail of an already registered account.
export async function grantNexusAdmin(actor: string, email: unknown) {
  await requireNexusAdmin(actor);
  await translated(() => db.transaction(async tx => {
    const person = await profileByEmail(tx, email);
    await tx.execute(sql`select public.grant_nexus_admin(${actor}::uuid, ${person.profileId}::uuid)`);
  }));
}

// D-42: a NEXUS admin can remove the role from another one or from themself, never from the last one.
export async function revokeNexusAdmin(actor: string, profileId: unknown) {
  if (!isUuid(profileId)) throw new NexusError("Persona inválida.");
  await requireNexusAdmin(actor);
  await translated(() => db.execute(sql`select public.revoke_nexus_admin(${actor}::uuid, ${profileId}::uuid)`));
}
