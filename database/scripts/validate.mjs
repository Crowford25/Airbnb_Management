import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { projectRoot } from "./database.mjs";

const migrationsDirectory = path.join(projectRoot, "database", "migrations");
const seedsDirectory = path.join(projectRoot, "database", "seeds");
const fileNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const expectedTables = [
  "users",
  "properties",
  "property_images",
  "amenities",
  "property_amenities",
  "cancellation_policies",
  "cancellation_policy_rules",
  "unit_types",
  "units",
  "unit_blocks",
  "rate_plans",
  "rate_periods",
  "tax_rules",
  "fee_rules",
  "reservations",
  "reservation_items",
  "reservation_item_units",
  "reservation_charges",
  "payments",
  "payment_refunds",
  "payment_webhook_events",
  "notification_outbox",
  "notification_attempts",
  "email_provider_webhook_events",
  "worker_heartbeats",
  "audit_events",
  "api_request_logs",
];

async function sqlFiles(directory) {
  const files = (await readdir(directory)).filter((file) => fileNamePattern.test(file));

  if (files.length === 0) {
    throw new Error(`No SQL files found in ${directory}.`);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function validate() {
  const migrationFiles = await sqlFiles(migrationsDirectory);
  const seedFiles = await sqlFiles(seedsDirectory);
  const migrationSql = (
    await Promise.all(
      migrationFiles.map((file) =>
        readFile(path.join(migrationsDirectory, file), "utf8"),
      ),
    )
  ).join("\n");

  if (/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(migrationSql)) {
    throw new Error(
      "Migration SQL must not manage transactions; the migration runner owns the transaction.",
    );
  }

  for (const table of expectedTables) {
    const pattern = new RegExp(`CREATE\\s+TABLE\\s+aureum\\.${table}\\s*\\(`, "i");

    if (!pattern.test(migrationSql)) {
      throw new Error(`Missing expected table aureum.${table}.`);
    }
  }

  for (const requiredFragment of [
    "unit_type_remaining_units",
    "reservation_items_validate",
    "reservation_item_units_no_active_overlap",
    "reservation_items_match_header",
    "reservations_release_units_on_cancel",
    "unit_blocks_no_overlap",
    "reservations_external_reference_unique",
    "property_images_one_cover_idx",
    "payments_status_valid",
    "payment_refunds_status_valid",
    "payment_webhook_events_status_idx",
    "notification_outbox_ready_idx",
    "notification_outbox_status_valid",
    "notification_attempts_outcome_valid",
    "email_provider_webhook_provider_valid",
    "worker_heartbeats_status_valid",
    "api_request_logs_outcome_valid",
  ]) {
    if (!migrationSql.includes(requiredFragment)) {
      throw new Error(`Missing schema guard ${requiredFragment}.`);
    }
  }

  console.log(
    `Validated ${migrationFiles.length} migration(s), ${seedFiles.length} seed file(s), and ${expectedTables.length} core tables.`,
  );
}

validate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
