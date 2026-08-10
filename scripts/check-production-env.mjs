const configured = (name) => {
  const value = process.env[name]?.trim();
  return value && !/(?:replace|example|\.\.\.)/i.test(value) ? value : null;
};

const failures = [];
const required = [
  "NEXT_PUBLIC_APP_URL",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "AUTH_SESSION_SECRET",
];

for (const name of required) {
  if (!configured(name)) failures.push(`${name} is missing or still a placeholder.`);
}

const appUrl = configured("NEXT_PUBLIC_APP_URL");
if (appUrl && !appUrl.startsWith("https://")) {
  failures.push("NEXT_PUBLIC_APP_URL must use https in production.");
}

const databaseUrl = configured("DATABASE_URL");
if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
      failures.push("DATABASE_URL must be a PostgreSQL URL.");
    }
    if (["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      failures.push("DATABASE_URL must not point to a local host in production.");
    }
  } catch {
    failures.push("DATABASE_URL is not a valid URL.");
  }
}

if (!["require", "verify-full"].includes(process.env.DATABASE_SSL?.trim() || "")) {
  failures.push("DATABASE_SSL must be require or verify-full in production.");
}
if (
  configured("STRIPE_SECRET_KEY") &&
  !configured("STRIPE_SECRET_KEY").startsWith("sk_live_")
) {
  failures.push("STRIPE_SECRET_KEY must be a live Stripe key in production.");
}
if (
  configured("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") &&
  !configured("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY").startsWith("pk_live_")
) {
  failures.push(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live Stripe key in production.",
  );
}
if (process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== "resend") {
  failures.push("EMAIL_PROVIDER must be resend in production.");
}
if ((configured("AUTH_SESSION_SECRET")?.length ?? 0) < 32) {
  failures.push("AUTH_SESSION_SECRET must be at least 32 characters.");
}

if (failures.length) {
  console.error("Production environment check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production environment check passed.");
}
