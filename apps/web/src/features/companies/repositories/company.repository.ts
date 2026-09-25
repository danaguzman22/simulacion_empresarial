import "server-only";
import { institutionAccessSql, requireInstitutionMember } from "@/features/institutions/repositories/institution-access";
import { canCreateSimulation, InstitutionError, validId } from "@/features/institutions/domain/institution";

import {
  and,
  desc,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  companies,
} from "@/db/schema";

import type {
  CreateCompanyInput,
} from "../domain/company";

export async function createCompany(input: CreateCompanyInput) {
  validId(input.institutionId);
  return db.transaction(async tx => {
    const member = await requireInstitutionMember(tx, input.institutionId, input.createdBy, true);
    if (!canCreateSimulation(member.role)) throw new InstitutionError("No tenés permiso docente para crear empresas en esta institución.");
    const [company] = await tx.insert(companies).values({ name: input.name.trim(), description: input.description?.trim() || null, createdBy: input.createdBy, institutionId: input.institutionId }).returning();
    return company;
  });
}

export async function findCompanyByIdForOwner(
  companyId: string,
  profileId: string
) {
  const [company] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        eq(companies.createdBy, profileId), institutionAccessSql(companies.id, profileId)
      )
    )
    .limit(1);

  return company ?? null;
}

export async function findCompaniesCreatedBy(
  profileId: string
) {
  return db
    .select()
    .from(companies)
    .where(
      and(eq(companies.createdBy, profileId), institutionAccessSql(companies.id, profileId))
    )
    .orderBy(
      desc(
        companies.createdAt
      )
    );
}
