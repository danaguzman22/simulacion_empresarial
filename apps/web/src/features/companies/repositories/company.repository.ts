import "server-only";

import {
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