import { requireCampaignInstitution, requireInstitutionMember } from "@/features/institutions/repositories/institution-access";
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameCardAssignments as assignments, gameRoleCards as cards, profiles } from "@/db/schema";
import { access, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { AssignmentError, canManageAssignments, validateAssignment, type AssignmentCommand } from "../domain/assignment";

export async function readParticipants(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const departments = await tx.select({ id: cards.id, name: cards.name, department: cards.department }).from(cards).where(eq(cards.gameId, gameId)).orderBy(asc(cards.department), asc(cards.id));
    const members = await tx.select({ id: assignments.id, cardId: assignments.cardId, name: profiles.displayName, revision: assignments.revision }).from(assignments).innerJoin(profiles, eq(profiles.id, assignments.profileId)).where(eq(assignments.gameId, gameId)).orderBy(asc(profiles.displayName), asc(assignments.id));
    const company = await requireCampaignInstitution(tx, game.campaignId, actorId);
    const canManage = canManageAssignments(role, game.status);
    // Equipos picker: active members of the institution not yet in this game, with their e-mail. Only for whoever can
    // edit the teams; the database function checks it again (0036) and returns nothing to anyone else.
    const candidates = canManage && company.institutionId
      ? [...await tx.execute<{ profile_id: string; display_name: string; email: string }>(sql`select * from public.game_assignment_candidates(${gameId}::uuid, ${actorId}::uuid)`)].map(c => ({ id: c.profile_id, name: c.display_name, email: c.email }))
      : [];
    return { departments, members, candidates, legacy: !company.institutionId, canManage };
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
      // Chosen from the list (profileId) or typed (e-mail): in both cases an ACTIVE member of this institution.
      const users = command.profileId
        ? await tx.execute(sql`select m.profile_id from public.institution_members m where m.institution_id=${company.institutionId}::uuid and m.profile_id=${command.profileId}::uuid and m.status='active'`)
        : await tx.execute(sql`select f.profile_id from public.find_registered_profile_by_email(${command.email.trim()}) f join public.institution_members m on m.profile_id=f.profile_id where m.institution_id=${company.institutionId}::uuid and m.status='active'`);
      if (users.length !== 1) throw new AssignmentError("No se encontró una cuenta con membresía aprobada en esta institución. La persona debe solicitar acceso primero.");
      const profileId = String(users[0].profile_id);
      await requireInstitutionMember(tx, company.institutionId, profileId, true);
      // D-48: whoever has a role in the campaign (Master, Co-Master, Observer) is never a member of its games (the database refuses it too).
      if ((await tx.execute(sql`select 1 from public.campaign_members where campaign_id=${game.campaignId}::uuid and profile_id=${profileId}::uuid`)).length)
        throw new AssignmentError("Quien es Master, Co-Master u Observador de la campaña no puede ser integrante de sus partidas.");
      const [existing] = await tx.select().from(assignments).where(and(eq(assignments.gameId, game.id), eq(assignments.profileId, profileId)));
      if (existing?.cardId === command.cardId) return;
      if (existing) throw new AssignmentError("El participante ya tiene departamento. Usá Cambiar departamento para corregirlo.");
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

// #87 (D-34): the successor game inherits the previous game's members, inside create-successor's transaction.
// Each member goes to the equivalent department (the new card with the same campaign base card) and is copied only
// under the same rule as "Agregar integrante": the company is linked to an institution and the person is still an
// active member of it. Only the assignment is inherited, never any use state (D-07).
export async function copySuccessorAssignments(tx: Transaction, previousGameId: string, gameId: string, campaignId: string, actorId: string) {
  const copied = await tx.execute<{ id: string }>(sql`insert into public.game_card_assignments (game_id, campaign_id, card_id, profile_id, updated_by)
    select ${gameId}::uuid, ${campaignId}::uuid, nc.id, a.profile_id, ${actorId}::uuid
    from public.game_card_assignments a
    join public.game_role_cards pc on pc.id = a.card_id and pc.game_id = a.game_id
    join public.game_role_cards nc on nc.game_id = ${gameId}::uuid and nc.campaign_id = ${campaignId}::uuid and nc.source_card_id = pc.source_card_id
    join public.campaigns ca on ca.id = ${campaignId}::uuid
    join public.companies co on co.id = ca.company_id and co.institution_id is not null
    join public.institution_members m on m.institution_id = co.institution_id and m.profile_id = a.profile_id and m.status = 'active'
    where a.game_id = ${previousGameId}::uuid
      -- D-48: someone who now has a role in the campaign is not carried over (same rule as adding a member).
      and not exists (select 1 from public.campaign_members cm where cm.campaign_id = ${campaignId}::uuid and cm.profile_id = a.profile_id)
    returning id`);
  return copied.length;
}
