import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jitiFactory from "jiti";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { MemoryStore } = jiti("../src/store.ts");
const { createScopeManager } = jiti("../src/scopes.ts");
const {
  resolveHookDefaultScope,
  resolveHookReadScopes,
} = jiti("../index.ts");

describe("Per-conv scope hook integration", () => {
  it("Alice and Bob in different channels get disjoint memory pools", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-hookint-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });
    const scopeManager = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
    });
    const config = { scopes: { default: "agent:${agentId}:conv:${convKey}" } };

    const aliceSession = "agent:bs:discord:channel:456";
    const bobSession = "agent:bs:discord:channel:789";

    // Alice writes a fact in her channel
    const aliceScope = resolveHookDefaultScope({
      scopeManager,
      agentId: "bs",
      sessionKey: aliceSession,
      configDefault: config.scopes.default,
    });
    assert.equal(aliceScope, "agent:bs:conv:discord:channel:456",
      "Alice's resolved scope should include her channel");
    await store.store({
      text: "Alice uses PostgreSQL",
      vector: [1, 0, 0, 0],
      category: "fact",
      scope: aliceScope,
      importance: 0.8,
    });

    // Bob writes a different fact in his channel
    const bobScope = resolveHookDefaultScope({
      scopeManager,
      agentId: "bs",
      sessionKey: bobSession,
      configDefault: config.scopes.default,
    });
    assert.equal(bobScope, "agent:bs:conv:discord:channel:789",
      "Bob's resolved scope should include his channel");
    await store.store({
      text: "Bob uses MongoDB",
      vector: [0, 1, 0, 0],
      category: "fact",
      scope: bobScope,
      importance: 0.8,
    });

    // Bob's read scope should NOT include Alice's data
    const bobReadScopes = resolveHookReadScopes({
      scopeManager,
      agentId: "bs",
      sessionKey: bobSession,
      configDefault: config.scopes.default,
    });

    const bobResults = await store.list(bobReadScopes, undefined, 100, 0);
    const bobTexts = bobResults.map((e) => e.text).sort();
    assert.ok(bobTexts.includes("Bob uses MongoDB"), "Bob should see his own write");
    assert.ok(!bobTexts.includes("Alice uses PostgreSQL"),
      `Bob must NOT see Alice's write (scopes Bob reads: ${JSON.stringify(bobReadScopes)})`);

    // Alice's read scope should NOT include Bob's data
    const aliceReadScopes = resolveHookReadScopes({
      scopeManager,
      agentId: "bs",
      sessionKey: aliceSession,
      configDefault: config.scopes.default,
    });
    const aliceResults = await store.list(aliceReadScopes, undefined, 100, 0);
    const aliceTexts = aliceResults.map((e) => e.text).sort();
    assert.ok(aliceTexts.includes("Alice uses PostgreSQL"));
    assert.ok(!aliceTexts.includes("Bob uses MongoDB"));

    await rm(tmp, { recursive: true, force: true });
  });

  it("Same channel, two messages: both end up in same scope (no within-channel isolation)", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-hookint-same-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });
    const scopeManager = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
    });
    const config = { scopes: { default: "agent:${agentId}:conv:${convKey}" } };

    const session = "agent:bs:discord:channel:111";

    const scope1 = resolveHookDefaultScope({
      scopeManager, agentId: "bs", sessionKey: session, configDefault: config.scopes.default,
    });
    await store.store({ text: "fact A", vector: [1,0,0,0], category: "fact", scope: scope1, importance: 0.5 });

    const scope2 = resolveHookDefaultScope({
      scopeManager, agentId: "bs", sessionKey: session, configDefault: config.scopes.default,
    });
    await store.store({ text: "fact B", vector: [0,1,0,0], category: "fact", scope: scope2, importance: 0.5 });

    assert.equal(scope1, scope2, "Same session → same scope");
    const readScopes = resolveHookReadScopes({
      scopeManager, agentId: "bs", sessionKey: session, configDefault: config.scopes.default,
    });
    const results = await store.list(readScopes, undefined, 100, 0);
    const texts = results.map(e => e.text).sort();
    assert.deepEqual(texts, ["fact A", "fact B"]);

    await rm(tmp, { recursive: true, force: true });
  });

  it("Admin agent with wildcard agentAccess sees all conv scopes", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-hookint-admin-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });

    // Pre-populate two conv scopes (as if Alice and Bob already wrote)
    await store.store({ text: "A1", vector: [1, 0, 0, 0], category: "fact", scope: "agent:bs:conv:c1", importance: 0.5 });
    await store.store({ text: "A2", vector: [0, 1, 0, 0], category: "fact", scope: "agent:bs:conv:c2", importance: 0.5 });
    await store.store({ text: "G1", vector: [0, 0, 1, 0], category: "fact", scope: "global", importance: 0.5 });

    const scopeManager = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
      agentAccess: {
        admin: ["global", "agent:bs:conv:*"],
      },
    });

    const adminReadScopes = resolveHookReadScopes({
      scopeManager,
      agentId: "admin",
      sessionKey: "agent:admin:cli:run",
      configDefault: "global",
    });

    const results = await store.list(adminReadScopes, undefined, 100, 0);
    const texts = results.map((e) => e.text).sort();
    assert.deepEqual(texts, ["A1", "A2", "G1"], "Admin should see both conv scopes + global via wildcard ACL");

    await rm(tmp, { recursive: true, force: true });
  });

  it("Backward compat: when no template, hook resolvers preserve agent:<id> behavior", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lance-hookint-bc-"));
    const store = new MemoryStore({ dbPath: tmp, vectorDim: 4 });
    const scopeManager = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
    });
    // No template configured
    const configDefault = "global";

    const sessionKey = "agent:bs:discord:channel:456";

    // Write should land in agent:bs (not "global")
    const writeScope = resolveHookDefaultScope({
      scopeManager, agentId: "bs", sessionKey, configDefault,
    });
    assert.equal(writeScope, "agent:bs", "non-template config falls through to getDefaultScope = agent:bs");

    await store.store({ text: "BC fact", vector: [1,0,0,0], category: "fact", scope: writeScope, importance: 0.5 });

    // Read should include agent:bs (not just [global, reflection])
    const readScopes = resolveHookReadScopes({
      scopeManager, agentId: "bs", sessionKey, configDefault,
    });
    assert.ok(readScopes.includes("agent:bs"), `agent:bs should be in read scopes (got ${JSON.stringify(readScopes)})`);

    const results = await store.list(readScopes, undefined, 100, 0);
    assert.ok(results.some(e => e.text === "BC fact"), "should be able to read back the fact");

    await rm(tmp, { recursive: true, force: true });
  });
});
