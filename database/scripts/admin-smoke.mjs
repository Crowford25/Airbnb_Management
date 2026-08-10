import { createHmac } from "node:crypto";

import { createDatabasePool } from "./database.mjs";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3017";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionToken(user) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  assert(secret && secret.length >= 32, "AUTH_SESSION_SECRET is not configured.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    email: user.email,
    exp: issuedAt + 900,
    iat: issuedAt,
    name: user.display_name,
    role: user.role,
    sub: user.id,
    v: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function expectPage(pathname, cookie, marker) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const body = await response.text();
  assert(response.status === 200, `${pathname} returned ${response.status}.`);
  assert(
    body.includes(marker),
    `${pathname} did not render the expected admin content.`,
  );
}

async function expectForbidden(pathname, cookie) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  assert(
    [303, 307, 308].includes(response.status),
    `${pathname} should redirect but returned ${response.status}.`,
  );
  assert(
    response.headers.get("location")?.includes("/admin?error=forbidden"),
    `${pathname} did not return the staff forbidden redirect.`,
  );
}

async function smoke() {
  const pool = createDatabasePool({ applicationName: "aureum-admin-smoke" });
  try {
    const result = await pool.query(`
      SELECT id, email, display_name, role
      FROM aureum.users
      WHERE role <> 'customer' AND is_active = true AND deleted_at IS NULL
    `);
    const users = new Map(result.rows.map((user) => [user.role, user]));
    for (const role of ["employee", "lead", "manager", "super_admin"]) {
      assert(
        users.has(role),
        `An active ${role} account is required for the admin smoke test.`,
      );
    }

    const cookies = Object.fromEntries(
      [...users].map(([role, user]) => [role, `aureum_session=${sessionToken(user)}`]),
    );
    const allPages = [
      ["/admin", "Live control centre"],
      ["/admin/operations", "Daily operations"],
      ["/admin/properties", "Properties and rooms"],
      ["/admin/reservations", "Reservations"],
      ["/admin/customers", "Customer records"],
      ["/admin/team", "Team and access"],
      ["/admin/reports", "Revenue and occupancy"],
      ["/admin/settings", "Roles and system"],
    ];

    for (const [pathname, marker] of allPages) {
      await expectPage(pathname, cookies.super_admin, marker);
    }
    for (const [pathname, marker] of allPages.slice(0, 5)) {
      await expectPage(pathname, cookies.employee, marker);
    }
    await expectForbidden("/admin/team", cookies.employee);
    await expectForbidden("/admin/reports", cookies.lead);
    await expectForbidden("/admin/settings", cookies.manager);
    await expectPage("/admin/team", cookies.lead, "Team and access");
    await expectPage("/admin/reports", cookies.manager, "Revenue and occupancy");

    console.log(
      "Admin smoke test passed: live pages render and employee, lead, manager, and Super Admin boundaries are enforced.",
    );
  } finally {
    await pool.end();
  }
}

smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
