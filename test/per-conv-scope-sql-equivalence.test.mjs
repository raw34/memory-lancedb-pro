import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jitiFactory from "jiti";
const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { MemoryStore, scopeFilterIncludes } = jiti("../src/store.ts");

const TEST_FILTERS = [
  undefined,
  [],
  ["global"],
  ["agent:bs"],
  ["agent:bs:conv:*"],
  ["global", "agent:bs:conv:*"],
  ["scope_with_underscore"],
  ["scope%with%percent"],
  ["scope\\with\\backslash"],
  ["a_b:*"],
];

const TEST_SCOPES = [
  "global",
  "agent:bs",
  "agent:bs:conv:discord:channel:456",
  "agent:bs:conv:discord:dm:user:abc",
  "scope_with_underscore",
  "scope%with%percent",
  "scope\\with\\backslash",
  "a_b:c",
  "reflection:agent:bs",
];

describe("SQL ⇔ application-layer equivalence", () => {
  it("scopeFilterIncludes matches MemoryStore.list results across full matrix", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-equiv-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    // Insert one row per test scope
    for (let i = 0; i < TEST_SCOPES.length; i++) {
      await store.store({
        text: `t${i}`,
        vector: [i, i, i, i],
        category: "fact",
        scope: TEST_SCOPES[i],
        importance: 0.5,
      });
    }

    for (const filter of TEST_FILTERS) {
      const expectedScopes = TEST_SCOPES.filter((s) => scopeFilterIncludes(filter, s));
      const sqlScopes = (await store.list(filter, undefined, 1000, 0)).map((e) => e.scope);
      const sortedExpected = [...expectedScopes].sort();
      const sortedSql = [...sqlScopes].sort();
      assert.deepEqual(
        sortedSql,
        sortedExpected,
        `Mismatch for filter ${JSON.stringify(filter)}\n` +
          `  app expected: ${JSON.stringify(sortedExpected)}\n` +
          `  sql returned: ${JSON.stringify(sortedSql)}`
      );
    }

    await rm(tmp, { recursive: true, force: true });
  });
});
