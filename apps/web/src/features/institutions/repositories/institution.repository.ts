import "server-only";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { institutions, institutionMembers as members, institutionAccessRequests as requests, profiles, companies } from "@/db/schema";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";
import { requireInstitutionMember } from "./institution-access";
import { InstitutionError, validId } from "../domain/institution";

async function admin(tx: Transaction, institutionId: string, actor: string) {
  const [institution] = await tx.select().from(institutions).where(eq(institutions.id, institutionId)).for("update");
  if (!institution || (await requireInstitutionMember(tx, institutionId, actor, true)).role !== "admin") throw new InstitutionError("Se requiere autoridad administrativa de esta institución.");
}
export async function myInstitutions(actor: string, search: string) {
  return db.transaction(async tx => ({
    memberships: await tx.select({ id: institutions.id, name: institutions.name, role: members.role, status: members.status }).from(members).innerJoin(institutions, eq(institutions.id, members.institutionId)).where(eq(members.profileId, actor)).orderBy(asc(institutions.name)),
    requests: await tx.select({ id: requests.id, institutionId: requests.institutionId, name: institutions.name, status: requests.status, requestedAt: requests.requestedAt }).from(requests).innerJoin(institutions, eq(institutions.id, requests.institutionId)).where(eq(requests.profileId, actor)).orderBy(desc(requests.requestedAt)).limit(100),
    results: search.trim().length >= 2 ? await tx.select({ id: institutions.id, name: institutions.name, type: institutions.type }).from(institutions).where(ilike(institutions.name, `%${search.trim().slice(0,160).replace(/[\\%_]/g, "\\$&")}%`)).orderBy(asc(institutions.name), asc(institutions.id)).limit(30) : [],
  }), { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function requestAccess(actor: string, institutionId: string, message: string) {
  validId(institutionId);
  if (message.length > 1000) throw new InstitutionError("El mensaje admite hasta 1000 caracteres.");
  return db.transaction(async tx => {
    const [found] = await tx.select().from(institutions).where(eq(institutions.id, institutionId)).for("update");
    if (!found) throw new InstitutionError("Institución no disponible.");
    const [member] = await tx.select().from(members).where(and(eq(members.institutionId, institutionId), eq(members.profileId, actor)));
    if (member?.status === "active") throw new InstitutionError("Ya sos miembro de esta institución.");
    await tx.insert(requests).values({ institutionId, profileId: actor, message: message.trim() }).onConflictDoNothing();
  });
}
export async function resolveRequest(actor: string, institutionId: string, requestId: string, decision: "approved" | "rejected") {
  validId(institutionId); validId(requestId);
  if (!["approved", "rejected"].includes(decision)) throw new InstitutionError("Resolución inválida.");
  return db.transaction(async tx => {
    await admin(tx, institutionId, actor);
    const [request] = await tx.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.institutionId, institutionId))).for("update");
    if (!request) throw new InstitutionError("Solicitud no disponible.");
    if (request.status === decision) return;
    if (request.status !== "pending") throw new InstitutionError("La solicitud ya fue resuelta. Recargá los datos.");
    if (decision === "approved") {
      const [existing] = await tx.select().from(members).where(and(eq(members.institutionId, institutionId), eq(members.profileId, request.profileId))).for("update");
      if (!existing) await tx.insert(members).values({ institutionId, profileId: request.profileId, grantedBy: actor });
      else if (existing.status === "revoked") await tx.update(members).set({ role: "member", status: "active", grantedBy: actor, revision: existing.revision + 1, updatedAt: new Date() }).where(eq(members.id, existing.id));
    }
    await tx.update(requests).set({ status: decision, resolvedBy: actor, resolvedAt: new Date() }).where(eq(requests.id, requestId));
  });
}
export async function readInstitution(actor: string, institutionId: string) {
  validId(institutionId);
  return db.transaction(async tx => {
    const self = await requireInstitutionMember(tx, institutionId, actor);
    const [institution] = await tx.select().from(institutions).where(eq(institutions.id, institutionId));
    const admins = await tx.select({ name: profiles.displayName }).from(members).innerJoin(profiles, eq(profiles.id, members.profileId)).where(and(eq(members.institutionId, institutionId), eq(members.role, "admin"), eq(members.status, "active"))).orderBy(asc(profiles.displayName));
    if (self.role !== "admin") return { institution, admins, canManage: false, members: [], requests: [], legacyCompanies: [] };
    const roster = await tx.select({ id: members.id, name: profiles.displayName, role: members.role, status: members.status, revision: members.revision }).from(members).innerJoin(profiles, eq(profiles.id, members.profileId)).where(eq(members.institutionId, institutionId)).orderBy(asc(profiles.displayName), asc(members.id));
    // Narrow function returns emails only for this institution's pending requests.
    const pending = await tx.execute<{ id: string; name: string; email: string; message: string; requested_at: string }>(sql`select * from public.institution_pending_requests(${institutionId}::uuid, ${actor}::uuid)`);
    const legacyCompanies = await tx.select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.createdBy, actor), sql`${companies.institutionId} is null`)).orderBy(asc(companies.name));
    return { institution, admins, canManage: true, members: roster, requests: [...pending], legacyCompanies };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function changeInstitutionMember(actor: string, institutionId: string, memberId: string, revision: number, operation: "revoke" | "teacher" | "member") {
  validId(institutionId); validId(memberId);
  if (!Number.isSafeInteger(revision) || revision < 0 || !["revoke", "teacher", "member"].includes(operation)) throw new InstitutionError("Cambio inválido.");
  return db.transaction(async tx => {
    await admin(tx, institutionId, actor);
    const [member] = await tx.select().from(members).where(and(eq(members.id, memberId), eq(members.institutionId, institutionId))).for("update");
    if (!member || member.revision !== revision) throw new InstitutionError("La membresía cambió. Recargá los datos.");
    if (member.role === "admin") throw new InstitutionError("La administración de otros administradores requiere intervención administrativa explícita.");
    if (member.status !== "active") throw new InstitutionError("La membresía no está activa. Debe solicitar acceso nuevamente.");
    await tx.update(members).set({ status: operation === "revoke" ? "revoked" : "active", role: operation === "revoke" ? member.role : operation, revision: revision + 1, updatedAt: new Date(), grantedBy: actor }).where(eq(members.id, memberId));
  });
}
export async function linkLegacyCompany(actor: string, institutionId: string, companyId: string) {
  validId(institutionId); validId(companyId);
  return db.transaction(async tx => {
    await admin(tx, institutionId, actor);
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).for("update");
    if (!company || company.createdBy !== actor || company.institutionId) throw new InstitutionError("Solo el propietario y administrador del destino puede vincular una empresa pendiente.");
    const missing = await tx.execute(sql`select public.company_missing_institution_members(${companyId}::uuid, ${institutionId}::uuid) as count`);
    if (Number(missing[0].count) > 0) throw new InstitutionError("Hay docentes o participantes existentes sin membresía aprobada en el destino. Resolvé sus solicitudes antes de vincular.");
    await tx.execute(sql`select set_config('nexus.institution_actor', ${actor}, true)`);
    await tx.update(companies).set({ institutionId, updatedAt: new Date() }).where(eq(companies.id, companyId));
  });
}
export async function teachingInstitutions(actor: string) {
  return db.select({ id: institutions.id, name: institutions.name }).from(members).innerJoin(institutions, eq(institutions.id, members.institutionId)).where(and(eq(members.profileId, actor), eq(members.status, "active"), sql`${members.role} in ('teacher','admin')`)).orderBy(asc(institutions.name));
}
export async function companyLinkOptions(actor: string, companyId: string) {
  validId(companyId);
  return db.select({ id: institutions.id, name: institutions.name }).from(companies)
    .innerJoin(members, and(eq(members.profileId, actor), eq(members.role, "admin"), eq(members.status, "active")))
    .innerJoin(institutions, eq(institutions.id, members.institutionId))
    .where(and(eq(companies.id, companyId), eq(companies.createdBy, actor), sql`${companies.institutionId} is null`)).orderBy(asc(institutions.name));
}
