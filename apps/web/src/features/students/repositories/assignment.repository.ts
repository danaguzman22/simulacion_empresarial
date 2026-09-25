import { requireCampaignInstitution, requireInstitutionMember } from "@/features/institutions/repositories/institution-access";
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameCardAssignments as assignments, gameRoleCards as cards, profiles } from "@/db/schema";
import { access } from "@/features/preparation/repositories/preparation.repository";
import { AssignmentError, canManageAssignments, validateAssignment, type AssignmentCommand } from "../domain/assignment";

export async function readParticipants(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const departments = await tx.select({ id: cards.id, name: cards.name, department: cards.department }).from(cards).where(eq(cards.gameId, gameId)).orderBy(asc(cards.department), asc(cards.id));
    const members = await tx.select({ id: assignments.id, cardId: assignments.cardId, name: profiles.displayName, revision: assignments.revision }).from(assignments).innerJoin(profiles, eq(profiles.id, assignments.profileId)).where(eq(assignments.gameId, gameId)).orderBy(asc(profiles.displayName), asc(assignments.id));
    const company = await requireCampaignInstitution(tx, game.campaignId, actorId);
    return { departments, members, legacy: !company.institutionId, canManage: canManageAssignments(role, game.status) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function changeAssignment(actorId: string, command: AssignmentCommand) {
  validateAssignment(command);
  return db.transaction(async tx => {
    // Same lock order as Start/Reset/Delete. Permission is rechecked under lock.
    const { game, role } = await access(tx, command.gameId, actorId, true);
    if (!canManageAssignments(role, game.status)) throw new AssignmentError("Solo el Master puede cambiar integrantes antes de la evaluación.");
    if (command.operation !== "remove") {
      const [target] = await tx.select({ id: cards.id }).from(cards).where(and(eq(cards.id, command.cardId), eq(cards.gameId, game.id), eq(cards.campaignId, game.campaignId)));
      if (!target) throw new AssignmentError("El departamento no pertenece a esta partida.");
    }
    if (command.operation === "add") {
      const company = await requireCampaignInstitution(tx, game.campaignId, actorId, true);
      if (!company.institutionId) throw new AssignmentError("La empresa está pendiente de vinculación institucional. No admite nuevos integrantes.");
      const users = await tx.execute(sql`select f.profile_id from public.find_registered_profile_by_email(${command.email.trim()}) f join public.institution_members m on m.profile_id=f.profile_id where m.institution_id=${company.institutionId}::uuid and m.status='active'`);
      if (users.length !== 1) throw new AssignmentError("No se encontró una cuenta con membresía aprobada en esta institución. El alumno debe solicitar acceso primero.");
      const profileId = String(users[0].profile_id);
      await requireInstitutionMember(tx, company.institutionId, profileId, true);
      const [existing] = await tx.select().from(assignments).where(and(eq(assignments.gameId, game.id), eq(assignments.profileId, profileId)));
      if (existing?.cardId === command.cardId) return;
      if (existing) throw new AssignmentError("El alumno ya tiene departamento. Usá Cambiar departamento para corregirlo.");
      await tx.insert(assignments).values({ gameId: game.id, campaignId: game.campaignId, cardId: command.cardId, profileId, updatedBy: actorId });
      return;
    }
    const [existing] = await tx.select().from(assignments).where(and(eq(assignments.id, command.assignmentId), eq(assignments.gameId, game.id)));
    if (!existing || existing.revision !== command.expectedRevision) throw new AssignmentError("La asignación cambió. Recargá los datos.");
    if (command.operation === "remove") await tx.delete(assignments).where(eq(assignments.id, existing.id));
    else {
      const company = await requireCampaignInstitution(tx, game.campaignId, actorId, true);
      if (!company.institutionId) throw new AssignmentError("Vinculá la empresa antes de cambiar departamentos.");
      await requireInstitutionMember(tx, company.institutionId, existing.profileId, true);
      await tx.update(assignments).set({ cardId: command.cardId, revision: existing.revision + 1, updatedAt: new Date(), updatedBy: actorId }).where(eq(assignments.id, existing.id));
    }
  });
}
