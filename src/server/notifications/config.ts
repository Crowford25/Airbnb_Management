import "server-only";

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value || /(?:replace|\.\.\.)/i.test(value)) return null;
  return value;
}

export function resendWebhookSecret() {
  const secret = configuredValue("RESEND_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) {
    throw new Error("RESEND_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

export function notificationAppUrl() {
  const configured = configuredValue("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid HTTP or HTTPS origin.");
  }
}

export function configuredAdminAlertEmails() {
  const value = configuredValue("ADMIN_ALERT_EMAILS");
  if (!value) return null;
  const emails = [
    ...new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (emails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
    throw new Error("ADMIN_ALERT_EMAILS contains an invalid email address.");
  }
  return emails;
}
