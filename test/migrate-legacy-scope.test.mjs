import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "@lancedb/lancedb";
import jitiFactory from "jiti";
import { migrateLegacyScope } from "../scripts/migrate-legacy-scope.mjs";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { MemoryStore } = jiti("../src/store.ts");

async function readScopes(dbPath) {
  const db = await connect(dbPath);
  const tbl = await db.openTable("memories");
  const rows = await tbl.query().toArray();
  return rows.map((r) => r.scope);
}

describe("migrateLegacyScope", () => {
  it("traceable record migrates to per-conv scope", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-mig-trace-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    await store.store({
      text: "Alice fact",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: "agent:bs",
      importance: 0.7,
      metadata: JSON.stringify({ source_session: "agent:bs:discord:channel:456" }),
    });

    const report = await migrateLegacyScope({ dbPath: tmp, agent: "bs", apply: true });

    assert.equal(report.migrated, 1);
    assert.equal(report.cold_stored, 0);
    assert.equal(report.errors.length, 0);

    const scopes = await readScopes(tmp);
    assert.deepEqual(scopes, ["agent:bs:conv:discord:channel:456"]);

    await rm(tmp, { recursive: true, force: true });
  });

  it("untraceable record stays in agent:<id> (cold storage)", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-mig-cold-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    await store.store({
      text: "manual fact",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: "agent:bs",
      importance: 0.7,
      metadata: JSON.stringify({ source: "manual" }),
    });

    const report = await migrateLegacyScope({ dbPath: tmp, agent: "bs", apply: true });

    assert.equal(report.migrated, 0);
    assert.equal(report.cold_stored, 1);

    const scopes = await readScopes(tmp);
    assert.deepEqual(scopes, ["agent:bs"]);

    await rm(tmp, { recursive: true, force: true });
  });

  it("dry-run does not write", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-mig-dry-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    await store.store({
      text: "x",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: "agent:bs",
      importance: 0.5,
      metadata: JSON.stringify({ source_session: "agent:bs:discord:channel:1" }),
    });

    const report = await migrateLegacyScope({ dbPath: tmp, agent: "bs", apply: false });

    assert.equal(report.migrated, 1);
    assert.equal(report.dry_run, true);

    const scopes = await readScopes(tmp);
    assert.deepEqual(scopes, ["agent:bs"]);

    await rm(tmp, { recursive: true, force: true });
  });

  it("idempotent: re-run skips already-migrated records", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-mig-idem-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    await store.store({
      text: "x",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: "agent:bs:conv:already:done",
      importance: 0.5,
      metadata: JSON.stringify({ source_session: "agent:bs:already:done" }),
    });

    const report = await migrateLegacyScope({ dbPath: tmp, agent: "bs", apply: true });

    assert.equal(report.scanned, 0);
    assert.equal(report.migrated, 0);

    await rm(tmp, { recursive: true, force: true });
  });

  it("malformed metadata JSON is recorded in errors, doesn't abort", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-mig-err-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    await store.store({
      text: "x",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: "agent:bs",
      importance: 0.5,
      metadata: "{not valid json",
    });
    await store.store({
      text: "y",
      vector: [0, 1, 0, 0],
      category: "fact",
      scope: "agent:bs",
      importance: 0.5,
      metadata: JSON.stringify({ source_session: "agent:bs:c:1" }),
    });

    const report = await migrateLegacyScope({ dbPath: tmp, agent: "bs", apply: true });

    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].error, "invalid_metadata_json");
    assert.equal(report.migrated, 1);

    await rm(tmp, { recursive: true, force: true });
  });
});
