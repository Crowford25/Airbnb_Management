import { randomBytes, scrypt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createDatabasePool, databaseTarget, projectRoot } from "./database.mjs";

const seedsDirectory = path.join(projectRoot, "database", "seeds");
const seedNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const deriveKey = promisify(scrypt);
const includeDemoAccounts = process.argv.includes("--demo");
const demoPassword = "AureumDemo!2026";

const configuredUsers = [
  { prefix: "AUTH_CUSTOMER", role: "customer" },
  { prefix: "AUTH_EMPLOYEE", role: "employee" },
  { prefix: "AUTH_LEAD", role: "lead" },
  { prefix: "AUTH_MANAGER", role: "manager" },
  { prefix: "AUTH_SUPER_ADMIN", role: "super_admin" },
];

function authUserFromEnvironment({ prefix, role }) {
  const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
  const displayName = process.env[`${prefix}_NAME`]?.trim();
  const passwordHash = process.env[`${prefix}_PASSWORD_HASH`]
    ?.trim()
    .replaceAll("\\$", "$");
  const suppliedValues = [email, displayName, passwordHash].filter(Boolean).length;

  if (suppliedValues === 0) {
    return null;
  }

  if (suppliedValues !== 3) {
    throw new Error(`${prefix} must provide EMAIL, NAME, and PASSWORD_HASH together.`);
  }

  return { email, displayName, passwordHash, role };
}

async function createDemoUsers() {
  const users = [
    ["demo.customer@aureum.test", "Demo Customer", "customer"],
    ["demo.employee@aureum.test", "Demo Employee", "employee"],
    ["demo.lead@aureum.test", "Demo Team Lead", "lead"],
    ["demo.manager@aureum.test", "Demo Manager", "manager"],
    ["demo.admin@aureum.test", "Demo Super Admin", "super_admin"],
  ];

  return Promise.all(
    users.map(async ([email, displayName, role]) => {
      const salt = randomBytes(16).toString("hex");
      const key = await deriveKey(demoPassword, salt, 64);
      return {
        email,
        displayName,
        role,
        passwordHash: `scrypt$${salt}$${key.toString("hex")}`,
      };
    }),
  );
}

async function seedConfiguredUsers(client) {
  const environmentUsers = configuredUsers
    .map(authUserFromEnvironment)
    .filter((user) => user !== null);
  const demoUsers = includeDemoAccounts ? await createDemoUsers() : [];
  const users = [...environmentUsers, ...demoUsers];

  for (const user of users) {
    await client.query(
      `
        INSERT INTO aureum.users (email, password_hash, display_name, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          is_active = true
      `,
      [user.email, user.passwordHash, user.displayName, user.role],
    );
  }

  return { configuredCount: environmentUsers.length, demoCount: demoUsers.length };
}

async function seed() {
  const pool = createDatabasePool({ applicationName: "aureum-seed" });
  const client = await pool.connect();

  try {
    console.log(`Connecting to ${databaseTarget()}`);
    await client.query("BEGIN");

    const files = (await readdir(seedsDirectory))
      .filter((file) => seedNamePattern.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const sql = await readFile(path.join(seedsDirectory, file), "utf8");
      await client.query(sql);
      console.log(`Seeded ${file}`);
    }

    const userCounts = await seedConfiguredUsers(client);
    await client.query("COMMIT");
    console.log(
      `Seeded ${userCounts.configuredCount} configured authentication user(s).`,
    );
    if (userCounts.demoCount)
      console.log(`Seeded ${userCounts.demoCount} local demo accounts.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
