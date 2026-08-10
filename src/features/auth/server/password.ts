import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { findActiveUserByEmail, recordUserLogin } from "@/server/db/repositories/users";

const deriveKey = promisify(scrypt);
const dummyPasswordHash =
  "scrypt$00000000000000000000000000000000$3e0a08fd1f678adb571077b83482c4b27494ea593b1155e8167e54f3853c6d79f45797a0d3edca53872f4b68393481336ee4f48f9d64f367e3f0673d0f81a611";

async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, salt, expectedHex] = encodedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");

  if (expected.length !== 64) {
    return false;
  }

  const actual = (await deriveKey(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredUser = await findActiveUserByEmail(normalizedEmail);
  const passwordMatches = await verifyPassword(
    password,
    configuredUser?.passwordHash ?? dummyPasswordHash,
  );

  if (!configuredUser || !passwordMatches) {
    return null;
  }

  await recordUserLogin(configuredUser.id);

  return {
    email: configuredUser.email,
    id: configuredUser.id,
    name: configuredUser.displayName,
    role: configuredUser.role,
  };
}
