// Supabase local para desarrollo (issue #26). Uso, desde apps/web:
//   npm run local:start                 levanta Supabase en Docker y aplica las migraciones de Drizzle
//   npm run local:dev                   arranca la app (puerto 3100) contra la base local
//   npm run local:admin -- <correo>     hace admin de la única "Institución de prueba" a una cuenta ya registrada
//   npm run local:nexus-admin -- <correo>  hace admin de NEXUS a una cuenta ya registrada (panel /nexus)
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
  return { dbUrl: status.DB_URL, apiUrl: status.API_URL, key, serviceKey: status.SERVICE_ROLE_KEY || status.SECRET_KEY, studioUrl: status.STUDIO_URL, mailUrl: status.MAILPIT_URL || status.INBUCKET_URL };
}

function appEnv(local) {
  return { ...process.env, DATABASE_URL: local.dbUrl, DATABASE_MIGRATION_URL: local.dbUrl, NEXT_PUBLIC_SUPABASE_URL: local.apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.key };
}

const TEST_INSTITUTION = "Institución de prueba";
const TEST_NEXUS_ADMIN = "admin-nexus@nexus.local";
const validEmail = email => typeof email === "string" && /^[^\s@]+@[^\s@]+$/.test(email);

async function profileFor(tx, email) {
  const [profile] = await tx`select p.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(${email})`;
  return profile?.id ?? null;
}

// #6: an active NEXUS admin of the LOCAL database, to approve registrations. If there is none, creates the test
// account admin-nexus@nexus.local through Supabase Auth (not with an INSERT) and makes it the first NEXUS admin.
// Its password is random and never shown: to use the panel, make your own account admin with local:nexus-admin.
async function ensureNexusAdmin(local, sql) {
  const [active] = await sql`select profile_id from public.nexus_admins where revoked_at is null order by granted_at limit 1`;
  if (active) return active.profile_id;
  let profile = await profileFor(sql, TEST_NEXUS_ADMIN);
  if (!profile) {
    if (!local.serviceKey) throw new Error("Supabase local no informó la clave de servicio: no se puede crear la cuenta de prueba.");
    const { randomBytes } = await import("node:crypto");
    const response = await fetch(`${local.apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: local.serviceKey, Authorization: `Bearer ${local.serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_NEXUS_ADMIN, password: randomBytes(24).toString("base64url"), email_confirm: true, user_metadata: { display_name: "Admin de NEXUS (prueba)" } }),
    });
    if (!response.ok) throw new Error(`No se pudo crear la cuenta de prueba ${TEST_NEXUS_ADMIN} (Supabase Auth respondió ${response.status}).`);
    profile = await profileFor(sql, TEST_NEXUS_ADMIN);
    if (!profile) throw new Error(`La cuenta ${TEST_NEXUS_ADMIN} no tiene perfil.`);
  }
  // granted_by null: the database accepts it only while there is no active NEXUS admin (first admin), and records it.
  await sql`insert into public.nexus_admins(profile_id) values (${profile})`;
  console.log(`Se creó ${TEST_NEXUS_ADMIN} como primer admin de NEXUS de la base local (sin contraseña conocida).`);
  return profile;
}

// #89 and #6: a single local "Institución de prueba", created like any other institution (registration approved by
// a NEXUS admin, never a direct INSERT into institutions) and reused afterwards: each account given becomes its admin.
async function admin(email) {
  if (!validEmail(email)) {
    console.error("Uso: npm run local:admin -- <correo>");
    process.exit(1);
  }
  const local = localEnv();
  const sql = require("postgres")(local.dbUrl, { max: 1, onnotice: () => {} });
  try {
    const person = await profileFor(sql, email);
    if (!person) {
      console.error(`No hay ninguna cuenta registrada con ${email} en la base local. Registrate primero en la app (npm run local:dev).`);
      process.exitCode = 1;
      return;
    }
    const approver = await ensureNexusAdmin(local, sql);
    const created = await sql.begin(async tx => {
      const [institution] = await tx`select id from public.institutions where name = ${TEST_INSTITUTION} order by created_at, id limit 1`;
      if (!institution) {
        // Complete test data (#6 form); the e-mail of the account is the responsible contact.
        const data = { legalName: TEST_INSTITUTION, kind: "educational", educationLevel: "university", organizationKind: "direct", country: "AR", province: "Córdoba",
          locality: "Local", postalCode: "5000", institutionalEmail: "contacto@prueba.local", institutionalPhone: "351 000 0000",
          responsiblePosition: "Admin de prueba", responsibleArea: "Pruebas", message: "Creada por npm run local:admin" };
        const [{ registration }] = await tx`select public.register_institution(${person}, ${email.toLowerCase()}, ${JSON.stringify(data)}::jsonb) as registration`;
        await tx`select public.approve_institution_registration(${approver}, ${registration})`;
        return true;
      }
      const [member] = await tx`select id, role, status, revision from public.institution_members where institution_id = ${institution.id} and profile_id = ${person}`;
      if (member?.role === "admin" && member.status === "active") return false;
      if (member) await tx`update public.institution_members set role = 'admin', status = 'active', revision = ${member.revision + 1}, granted_by = ${approver}, updated_at = now() where id = ${member.id}`;
      else await tx`insert into public.institution_members(institution_id, profile_id, role, granted_by) values (${institution.id}, ${person}, 'admin', ${approver})`;
      return false;
    });
    console.log(created ? `Listo: se creó "${TEST_INSTITUTION}" (aprobada por un admin de NEXUS) y ${email} es su admin.` : `Listo: ${email} es admin de "${TEST_INSTITUTION}" en la base local.`);
  } finally {
    await sql.end();
  }
}

// #6: makes an existing LOCAL account a NEXUS admin, granted by an active NEXUS admin (as the panel does).
async function nexusAdmin(email) {
  if (!validEmail(email)) {
    console.error("Uso: npm run local:nexus-admin -- <correo>");
    process.exit(1);
  }
  const local = localEnv();
  const sql = require("postgres")(local.dbUrl, { max: 1, onnotice: () => {} });
  try {
    const person = await profileFor(sql, email);
    if (!person) {
      console.error(`No hay ninguna cuenta registrada con ${email} en la base local. Registrate primero en la app (npm run local:dev).`);
      process.exitCode = 1;
      return;
    }
    const actor = await ensureNexusAdmin(local, sql);
    const [{ already }] = await sql`select public.is_nexus_admin(${person}) as already`;
    if (!already) await sql`select public.grant_nexus_admin(${actor}, ${person})`;
    console.log(`Listo: ${email} es admin de NEXUS en la base local.`);
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
  await admin(rest[0]);
} else if (command === "nexus-admin") {
  await nexusAdmin(rest[0]);
} else if (command === "stop") {
  supabase(["stop"]);
} else {
  console.error("Comandos: start | migrate | dev | admin <correo> | nexus-admin <correo> | stop");
  process.exit(1);
}
