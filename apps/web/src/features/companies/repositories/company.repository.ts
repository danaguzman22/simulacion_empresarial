import "server-only";

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

export async function createCompany(
  input: CreateCompanyInput
) {
  const [company] =
    await db
      .insert(companies)
      .values({
        name:
          input.name.trim(),

        description:
          input.description
            ?.trim() || null,

        createdBy:
          input.createdBy,
      })
      .returning();

  return company;
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
        eq(companies.createdBy, profileId)
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
      eq(
        companies.createdBy,
        profileId
      )
    )
    .orderBy(
      desc(
        companies.createdAt
      )
    );
}
