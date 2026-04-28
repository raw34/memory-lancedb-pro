#!/usr/bin/env node
import { connect } from "@lancedb/lancedb";
import { cp } from "node:fs/promises";

const TABLE_NAME = "memories";

/**
 * @param {object} opts
 * @param {string} opts.dbPath  - Path to LanceDB directory
 * @param {string} opts.agent   - Agent ID (without "agent:" prefix)
 * @param {boolean} [opts.apply=false] - false = dry-run (default)
 * @param {boolean} [opts.noBackup=false] - false = create backup (default)
 * @returns {Promise<{agent, scanned, migrated, cold_stored, errors, duration_ms, dry_run, backup_path?}>}
 */
export async function migrateLegacyScope(opts) {
  const t0 = Date.now();
  const { dbPath, agent, apply = false, noBackup = false } = opts;
  if (!dbPath || !agent) throw new Error("dbPath and agent are required");

  const legacyScope = `agent:${agent}`;
  const report = {
    agent,
    scanned: 0,
    migrated: 0,
    cold_stored: 0,
    errors: [],
    duration_ms: 0,
    dry_run: !apply,
  };

  if (apply && !noBackup) {
    const backupPath = `${dbPath}.backup-${Date.now()}`;
    await cp(dbPath, backupPath, { recursive: true });
    report.backup_path = backupPath;
  }

  const db = await connect(dbPath);
  const table = await db.openTable(TABLE_NAME);

  const safeLegacy = legacyScope.replace(/'/g, "''");
  const rows = await table.query()
    .where(`scope = '${safeLegacy}'`)
    .toArray();

  for (const row of rows) {
    report.scanned++;
    const id = row.id;
    let metadata;
    try {
      metadata = JSON.parse(row.metadata || "{}");
    } catch {
      report.errors.push({ id, error: "invalid_metadata_json", raw_metadata: row.metadata });
      continue;
    }
    const sourceSession = metadata.source_session;
    if (typeof sourceSession !== "string" || !sourceSession) {
      report.cold_stored++;
      continue;
    }
    const prefix = `agent:${agent}:`;
    if (!sourceSession.startsWith(prefix)) {
      report.errors.push({ id, error: "source_session_prefix_mismatch", source_session: sourceSession });
      continue;
    }
    const convKey = sourceSession.slice(prefix.length);
    if (!convKey) {
      report.cold_stored++;
      continue;
    }
    const newScope = `agent:${agent}:conv:${convKey}`;
    if (apply) {
      try {
        const safeId = id.replace(/'/g, "''");
        await table.update({
          values: { scope: newScope },
          where: `id = '${safeId}'`,
        });
      } catch (e) {
        report.errors.push({ id, error: "update_failed", message: String(e) });
        continue;
      }
    }
    report.migrated++;
  }

  report.duration_ms = Date.now() - t0;
  return report;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--db") opts.dbPath = args[++i];
    else if (a === "--agent") opts.agent = args[++i];
    else if (a === "--apply") opts.apply = true;
    else if (a === "--no-backup") opts.noBackup = true;
    else if (a === "--report-out") opts.reportOut = args[++i];
    else if (a === "--help") {
      console.log(
        `Usage: migrate-legacy-scope.mjs --agent <id> --db <path> [--apply] [--no-backup] [--report-out <path>]
Default mode is dry-run (no writes). Pass --apply to perform writes.`,
      );
      process.exit(0);
    }
  }
  if (!opts.dbPath || !opts.agent) {
    console.error("Missing required --agent or --db");
    process.exit(2);
  }
  migrateLegacyScope(opts)
    .then(async (report) => {
      const json = JSON.stringify(report, null, 2);
      if (opts.reportOut) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(opts.reportOut, json);
      } else {
        console.log(json);
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
