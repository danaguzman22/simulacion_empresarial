// Supabase local para desarrollo (issue #26). Uso, desde apps/web:
//   npm run local:start                 levanta Supabase en Docker y aplica las migraciones de Drizzle
//   npm run local:dev                   arranca la app (puerto 3100) contra la base local
//   npm run local:admin -- <correo>     hace admin de su institución de prueba (una por cuenta) a una cuenta ya registrada
//   npm run local:stop                  apaga los contenedores (los datos se conservan)
// Nunca lee ni modifica .env.local: las variables se pasan al proceso y tienen prioridad sobre ese archivo.
// Antes de conectar, verifica que la base y la API sean de esta PC; si no, se detiene.
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(web, "../..");
const require = createRequire(path.join(web, "package.json"));
const windows = process.platform === "win32";
const bin = name => path.join(web, "node_modules", ".bin", windows ? `${name}.cmd` : name);

// Windows needs a shell for the .cmd launchers; the command line is built here with every part quoted,
// and only fixed arguments or validated options ever reach it.
const commandLine = (name, args) => [bin(name), ...args].map(part => `"${String(part).replace(/"/g, '""')}"`).join(" ");
const launch = (name, args, options) => windows ? spawnSync(commandLine(name, args), { ...options, shell: true }) : spawnSync(bin(name), args, options);

function run(name, args, env = process.env) {
  const result = launch(name, args, { cwd: web, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function supabase(args) {
  run("supabase", [...args, "--workdir", repo]);
}

// Reads the local stack's URLs and keys from the CLI and refuses anything that is not on this machine.
function localEnv() {
  const result = launch("supabase", ["status", "-o", "env", "--workdir", repo], { cwd: web, encoding: "utf8" });
  if (result.status !== 0) {
    console.error("Supabase local no está corriendo. Ejecutá primero: npm run local:start");
    process.exit(1);
  }
  const status = require("dotenv").parse(result.stdout);
  const local = value => { try { return ["127.0.0.1", "localhost"].includes(new URL(value).hostname); } catch { return false; } };
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  if (!local(status.DB_URL) || !local(status.API_URL) || !key) {
    console.error("La base o la API no son locales (127.0.0.1). Por seguridad, no se continúa.");
    process.exit(1);
  }
  return { dbUrl: status.DB_URL, apiUrl: status.API_URL, key, studioUrl: status.STUDIO_URL, mailUrl: status.MAILPIT_URL || status.INBUCKET_URL };
}

function appEnv(local) {
  return { ...process.env, DATABASE_URL: local.dbUrl, DATABASE_MIGRATION_URL: local.dbUrl, NEXT_PUBLIC_SUPABASE_URL: local.apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.key };
}

async function admin(email, institutionName) {
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    console.error("Uso: npm run local:admin -- <correo> [nombre de la institución]");
    process.exit(1);
  }
  const sql = require("postgres")(localEnv().dbUrl, { max: 1, onnotice: () => {} });
  try {
    // Same steps as database/admin/provision-institution.sql, only against the local database.
    const result = await sql.begin(async tx => {
      const [profile] = await tx`select p.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(${email})`;
      if (!profile) return null;
      // Running it twice for the same account reuses its test institution instead of creating a homonym.
      const [existing] = await tx`select i.id from public.institutions i join public.institution_members m on m.institution_id = i.id where i.name = ${institutionName} and m.profile_id = ${profile.id} and m.role = 'admin' and m.status = 'active'`;
      if (existing) return existing.id;
      const [institution] = await tx`insert into public.institutions(name, type) values (${institutionName}, 'educational') returning id`;
      await tx`insert into public.institution_members(institution_id, profile_id, role, granted_by) values (${institution.id}, ${profile.id}, 'admin', ${profile.id})`;
      return institution.id;
    });
    if (!result) {
      console.error(`No hay ninguna cuenta registrada con ${email} en la base local. Registrate primero en la app (npm run local:dev).`);
      process.exitCode = 1;
    } else {
      console.log(`Listo: ${email} es admin de "${institutionName}" en la base local.`);
    }
  } finally {
    await sql.end();
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === "start") {
  supabase(["start"]);
  console.log("Aplicando las migraciones de Drizzle a la base local…");
  run("drizzle-kit", ["migrate"], appEnv(localEnv()));
  const local = localEnv();
  console.log(`\nSupabase local listo.\n  Studio (ver datos): ${local.studioUrl}\n  Correos de prueba:  ${local.mailUrl}\nSeguí con: npm run local:dev`);
} else if (command === "migrate") {
  run("drizzle-kit", ["migrate"], appEnv(localEnv()));
} else if (command === "dev") {
  if (rest.some(option => !/^[\w.:=-]+$/.test(option))) {
    console.error("Opciones no válidas para next dev.");
    process.exit(1);
  }
  const env = appEnv(localEnv()), args = ["dev", "-p", "3100", ...rest];
  const child = windows ? spawn(commandLine("next", args), { cwd: web, env, stdio: "inherit", shell: true }) : spawn(bin("next"), args, { cwd: web, env, stdio: "inherit" });
  child.on("exit", code => process.exit(code ?? 0));
} else if (command === "admin") {
  // Default name includes the account, so two test admins never get institutions with the same name.
  await admin(rest[0], rest.slice(1).join(" ") || `Institución de prueba de ${rest[0]}`);
} else if (command === "stop") {
  supabase(["stop"]);
} else {
  console.error("Comandos: start | migrate | dev | admin <correo> [institución] | stop");
  process.exit(1);
}
