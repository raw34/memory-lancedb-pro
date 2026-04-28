import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";
const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { extractConvKey, resolveTemplate, resolveHookDefaultScope, resolveHookReadScopes } = jiti("../index.ts");
const { createScopeManager } = jiti("../src/scopes.ts");

describe("extractConvKey", () => {
  it("extracts suffix after agent:<id>: from Discord channel sessionKey", () => {
    assert.equal(
      extractConvKey("agent:bs-intern:discord:channel:456", "bs-intern"),
      "discord:channel:456"
    );
  });
  it("extracts suffix from Discord DM sessionKey", () => {
    assert.equal(
      extractConvKey("agent:bs-intern:discord:dm:user:abc", "bs-intern"),
      "discord:dm:user:abc"
    );
  });
  it("includes :subagent: suffix as part of convKey (subagents have own scope by default)", () => {
    assert.equal(
      extractConvKey("agent:bs-intern:discord:channel:456:subagent:xyz", "bs-intern"),
      "discord:channel:456:subagent:xyz"
    );
  });
  it("returns empty string when sessionKey is bare agent:<id>", () => {
    assert.equal(extractConvKey("agent:bs-intern", "bs-intern"), "");
  });
  it("returns empty string when sessionKey doesn't start with agent:<id>:", () => {
    assert.equal(extractConvKey("other:bs-intern:foo", "bs-intern"), "");
    assert.equal(extractConvKey("", "bs-intern"), "");
    assert.equal(extractConvKey(undefined, "bs-intern"), "");
  });
  it("returns empty string when agentId is empty or undefined", () => {
    assert.equal(extractConvKey("agent:x:y", ""), "");
    assert.equal(extractConvKey("agent:x:y", undefined), "");
  });
});

describe("resolveTemplate", () => {
  it("substitutes ${agentId}", () => {
    assert.equal(
      resolveTemplate("agent:${agentId}", { agentId: "bs", convKey: "" }),
      "agent:bs"
    );
  });
  it("substitutes ${convKey}", () => {
    assert.equal(
      resolveTemplate("conv:${convKey}", { agentId: "bs", convKey: "discord:456" }),
      "conv:discord:456"
    );
  });
  it("substitutes both vars in one template", () => {
    assert.equal(
      resolveTemplate("agent:${agentId}:conv:${convKey}", {
        agentId: "bs",
        convKey: "discord:456",
      }),
      "agent:bs:conv:discord:456"
    );
  });
  it("returns null when template references unknown variable", () => {
    assert.equal(
      resolveTemplate("agent:${unknownVar}", { agentId: "bs", convKey: "" }),
      null
    );
  });
  it("returns the input string unchanged when no template variables (fast path)", () => {
    assert.equal(resolveTemplate("global", { agentId: "bs", convKey: "x" }), "global");
    assert.equal(
      resolveTemplate("agent:bs", { agentId: "bs", convKey: "x" }),
      "agent:bs"
    );
  });
  it("returns null when convKey is empty but template references it", () => {
    assert.equal(
      resolveTemplate("conv:${convKey}", { agentId: "bs", convKey: "" }),
      null
    );
  });
});

const mgr = createScopeManager({
  definitions: { global: { description: "" } },
});

describe("resolveHookDefaultScope", () => {
  it("resolves template successfully for normal agent + sessionKey", () => {
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:discord:channel:456",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.equal(result, "agent:bs:conv:discord:channel:456");
  });

  it("falls back to 'global' when system bypass agentId", () => {
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "system",
      sessionKey: "agent:system:foo",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.equal(result, "global");
  });

  it("falls back to 'global' when sessionKey has no convKey suffix", () => {
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.equal(result, "global");
  });

  it("falls back to 'global' when template has unknown variable", () => {
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x:y",
      configDefault: "agent:${unknownVar}",
    });
    assert.equal(result, "global");
  });

  it("delegates to scopeManager.getDefaultScope when configDefault has no template variables", () => {
    // Static configDefault (no "${") means no per-conv override is active.
    // The function delegates to scopeManager.getDefaultScope(agentId), which returns
    // the agent's private scope when available, not the literal static string.
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x",
      configDefault: "global",
    });
    // mgr has no explicit agentAccess for "bs", getDefaultScope returns "agent:bs".
    assert.equal(result, "agent:bs");
  });

  it("delegates to scopeManager.getDefaultScope when configDefault is undefined or empty", () => {
    // When no configDefault template is set, resolveHookDefaultScope should delegate
    // to scopeManager.getDefaultScope(agentId), which returns the agent's private scope
    // ("agent:<id>") when available, not a hardcoded "global".
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x",
      configDefault: undefined,
    });
    // mgr has no explicit agentAccess for "bs", so getAccessibleScopes returns
    // ["global", "agent:bs", "reflection:agent:bs"] and getDefaultScope returns "agent:bs".
    assert.equal(result, "agent:bs");
  });

  it("falls back to 'global' when resolved scope fails validateScope (e.g., contains single-quote)", () => {
    // Single-quote (and other invalid chars) rejected by validateScopeFormat
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs'inject",
      sessionKey: "agent:bs'inject:x",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.equal(result, "global");
  });
});

describe("resolveHookReadScopes", () => {
  it("returns [global, resolvedDefault, reflection:agent:<id>] when no agentAccess", () => {
    const mgr = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
    });
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:discord:channel:456",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.deepEqual(result, [
      "global",
      "agent:bs:conv:discord:channel:456",
      "reflection:agent:bs",
    ]);
  });

  it("returns agentAccess list (templates resolved, wildcards preserved) when configured", () => {
    const mgr = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
      agentAccess: {
        monitor: ["global", "agent:bs:conv:*", "reflection:agent:bs"],
      },
    });
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "monitor",
      sessionKey: "agent:monitor:cli:run",
      configDefault: "global",
    });
    assert.deepEqual(result, ["global", "agent:bs:conv:*", "reflection:agent:bs"]);
  });

  it("resolves templates inside agentAccess entries", () => {
    const mgr = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
      agentAccess: {
        bs: ["global", "agent:${agentId}:conv:${convKey}"],
      },
    });
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:discord:channel:456",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    // agentAccess takes precedence; templates inside it ARE resolved
    assert.deepEqual(result, ["global", "agent:bs:conv:discord:channel:456"]);
    // No auto-injected reflection scope when explicit agentAccess is set
  });

  it("for bypass agent returns ['global'] (no template resolution)", () => {
    const mgr = createScopeManager({ default: "global", definitions: { global: { description: "" } } });
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "system",
      sessionKey: "agent:system:foo",
      configDefault: "agent:${agentId}:conv:${convKey}",
    });
    assert.deepEqual(result, ["global"]);
  });

  it("dedupes when resolved default equals 'global' (static config)", () => {
    const mgr = createScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
    });
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x",
      configDefault: "global",
    });
    // Static config delegates to getAccessibleScopes — preserves existing semantics
    assert.deepEqual([...result].sort(), ["agent:bs", "global", "reflection:agent:bs"].sort());
  });
});
