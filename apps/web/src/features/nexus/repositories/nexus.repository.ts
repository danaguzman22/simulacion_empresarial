import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { institutionRegistrations as registrations, institutions, nexusAdminActions as actions, nexusAdmins, profiles } from "@/db/schema";
import { isUuid } from "@/features/session/domain/session";
import { MAX_PENDING_REGISTRATIONS, NexusError, possibleDuplicate, validateReason, validateRegistration } from "../domain/registration";

// #6: every write goes through the SECURITY DEFINER functions of 0034, which re-check the rules in the database.
// Here the server checks first (signed-in person, NEXUS admin, valid input) and turns database errors into Spanish.
const databaseMessages: Array<[RegExp, string]> = [
  [/At most 3 pending/, `Ya tenés ${MAX_PENDING_REGISTRATIONS} solicitudes de institución pendientes. Esperá a que se resuelvan.`],
  [/no longer pending/, "La solicitud ya fue resuelta. Recargá la página."],
  [/Cannot revoke the last NEXUS admin/, "No se puede quitar el rol al último admin de NEXUS."],
  [/Only an active NEXUS admin/, "Necesitás ser admin de NEXUS."],
  [/nexus_admins_active_unique/, "Esa persona ya es admin de NEXUS."],
  [/not an active NEXUS admin/, "Esa persona ya no es admin de NEXUS."],
];
async function translated<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const text = [error instanceof Error ? error.message : "", (error as { cause?: { message?: string } })?.cause?.message ?? ""].join(" ");
    const known = databaseMessages.find(([pattern]) => pattern.test(text));
    if (known) throw new NexusError(known[1]);
    throw error;
  }
}

export async function isNexusAdmin(actor: string) {
  const [row] = await db.execute<{ ok: boolean }>(sql`select public.is_nexus_admin(${actor}::uuid) as ok`);
  return row?.ok === true;
}
async function requireNexusAdmin(actor: string) {
  if (!await isNexusAdmin(actor)) throw new NexusError("Necesitás ser admin de NEXUS.");
}

// D-41: before registering, warn about an approved institution or a pending registration with the same name and
// locality (without saying who registered it). The person can confirm and send it anyway.
export async function registerInstitution(actor: string, raw: { name: unknown; kind: unknown; locality: unknown; message: unknown }, confirmDuplicate: boolean) {
  const input = validateRegistration(raw);
  return translated(() => db.transaction(async tx => {
    const [{ pending }] = await tx.select({ pending: sql<number>`count(*)::int` }).from(registrations)
      .where(and(eq(registrations.profileId, actor), eq(registrations.status, "pending")));
    if (pending >= MAX_PENDING_REGISTRATIONS) throw new NexusError(`Ya tenés ${MAX_PENDING_REGISTRATIONS} solicitudes de institución pendientes. Esperá a que se resuelvan.`);
    if (!confirmDuplicate) {
      const existing = await tx.select({ name: institutions.name, locality: institutions.locality }).from(institutions);
      const waiting = await tx.select({ name: registrations.name, locality: registrations.locality }).from(registrations).where(eq(registrations.status, "pending"));
      const matches = [
        ...existing.filter(i => possibleDuplicate(input, i)).map(i => i.locality ? `${i.name} · ${i.locality}` : i.name),
        ...(waiting.some(r => possibleDuplicate(input, r)) ? ["Una solicitud pendiente con ese nombre y localidad"] : []),
      ];
      if (matches.length) return { status: "duplicate" as const, matches };
    }
    await tx.execute(sql`select public.register_institution(${actor}::uuid, ${input.name}, ${input.kind}::public.institution_type, ${input.locality}, ${input.message})`);
    return { status: "registered" as const };
  }));
}

// "Mis solicitudes": the person's own registrations, with the rejection reason (D-43).
export async function myRegistrations(actor: string) {
  return db.select({ id: registrations.id, name: registrations.name, locality: registrations.locality, status: registrations.status,
    rejectionReason: registrations.rejectionReason, requestedAt: registrations.requestedAt, resolvedAt: registrations.resolvedAt })
    .from(registrations).where(eq(registrations.profileId, actor)).orderBy(desc(registrations.requestedAt), asc(registrations.id));
}

// The NEXUS administration panel. Null for anyone who is not an active NEXUS admin.
export async function readNexusPanel(actor: string) {
  if (!await isNexusAdmin(actor)) return null;
  const registrant = alias(profiles, "registrant"), resolver = alias(profiles, "resolver"), granter = alias(profiles, "granter");
  const actor_ = alias(profiles, "actor"), target = alias(profiles, "target");
  return db.transaction(async tx => {
    const pending = await tx.select({ id: registrations.id, name: registrations.name, kind: registrations.type, locality: registrations.locality,
      message: registrations.message, requestedAt: registrations.requestedAt, registrant: registrant.displayName })
      .from(registrations).innerJoin(registrant, eq(registrant.id, registrations.profileId))
      .where(eq(registrations.status, "pending")).orderBy(asc(registrations.requestedAt), asc(registrations.id));
    const resolved = await tx.select({ id: registrations.id, name: registrations.name, locality: registrations.locality, status: registrations.status,
      rejectionReason: registrations.rejectionReason, resolvedAt: registrations.resolvedAt, registrant: registrant.displayName, resolver: resolver.displayName })
      .from(registrations).innerJoin(registrant, eq(registrant.id, registrations.profileId)).leftJoin(resolver, eq(resolver.id, registrations.resolvedBy))
      .where(isNotNull(registrations.resolvedAt)).orderBy(desc(registrations.resolvedAt), asc(registrations.id)).limit(20);
    const admins = await tx.select({ profileId: nexusAdmins.profileId, name: profiles.displayName, grantedAt: nexusAdmins.grantedAt, grantedBy: granter.displayName })
      .from(nexusAdmins).innerJoin(profiles, eq(profiles.id, nexusAdmins.profileId)).leftJoin(granter, eq(granter.id, nexusAdmins.grantedBy))
      .where(isNull(nexusAdmins.revokedAt)).orderBy(asc(profiles.displayName), asc(nexusAdmins.profileId));
    const history = await tx.select({ id: actions.id, action: actions.action, createdAt: actions.createdAt, actor: actor_.displayName, target: target.displayName,
      registration: registrations.name }).from(actions)
      .leftJoin(actor_, eq(actor_.id, actions.actorId)).leftJoin(target, eq(target.id, actions.targetProfileId))
      .leftJoin(registrations, eq(registrations.id, actions.registrationId))
      .orderBy(desc(actions.createdAt), desc(actions.id)).limit(30);
    return { pending, resolved, admins, history, self: actor };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
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

// D-42: only a NEXUS admin names another one, by the e-mail of an already registered account.
export async function grantNexusAdmin(actor: string, email: unknown) {
  const clean = typeof email === "string" ? email.trim() : "";
  if (!clean || clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new NexusError("Ingresá el correo registrado de la persona.");
  await requireNexusAdmin(actor);
  await translated(() => db.transaction(async tx => {
    const found = await tx.execute<{ profile_id: string }>(sql`select profile_id from public.find_registered_profile_by_email(${clean})`);
    if (found.length !== 1) throw new NexusError("No hay ninguna cuenta registrada con ese correo.");
    await tx.execute(sql`select public.grant_nexus_admin(${actor}::uuid, ${String(found[0].profile_id)}::uuid)`);
  }));
}

// D-42: a NEXUS admin can remove the role from another one or from themself, never from the last one.
export async function revokeNexusAdmin(actor: string, profileId: unknown) {
  if (!isUuid(profileId)) throw new NexusError("Persona inválida.");
  await requireNexusAdmin(actor);
  await translated(() => db.execute(sql`select public.revoke_nexus_admin(${actor}::uuid, ${profileId}::uuid)`));
}

