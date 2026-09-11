import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

if (!process.env.DATABASE_MIGRATION_URL) {
  throw new Error(
    "DATABASE_MIGRATION_URL no está configurada en .env.local"
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",

  out: "../../database/migrations",

  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL,
  },

  verbose: true,
  strict: true,
});