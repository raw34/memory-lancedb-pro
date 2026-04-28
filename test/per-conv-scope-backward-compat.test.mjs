import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { createScopeManager } = jiti("../src/scopes.ts");
const {
  resolveHookDefaultScope,
  resolveHookReadScopes,
} = jiti("../index.ts");

describe("Backward compat: zero impact when feature is off", () => {
  // Default config — no template, no wildcard. Mimics pre-PR setup.
  const cfg = { scopes: { default: "global" } };

  it("getDefaultScope returns 'agent:<id>' (unchanged from pre-PR)", () => {
    const mgr = createScopeManager(cfg.scopes);
    assert.equal(mgr.getDefaultScope("bs"), "agent:bs");
  });

  it("getAccessibleScopes returns [global, agent:<id>, reflection:agent:<id>]", () => {
    const mgr = createScopeManager(cfg.scopes);
    const scopes = mgr.getAccessibleScopes("bs");
    assert.deepEqual([...scopes].sort(), ["agent:bs", "global", "reflection:agent:bs"]);
  });

  it("isAccessible behaviour identical to pre-PR for literal ACL", () => {
    const mgr = createScopeManager(cfg.scopes);
    assert.equal(mgr.isAccessible("global", "bs"), true);
    assert.equal(mgr.isAccessible("agent:bs", "bs"), true);
    assert.equal(mgr.isAccessible("reflection:agent:bs", "bs"), true);
    assert.equal(mgr.isAccessible("agent:other", "bs"), false);
  });

  it("resolveHookDefaultScope with static config delegates to getDefaultScope (= agent:<id>)", () => {
    const mgr = createScopeManager(cfg.scopes);
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:any:thing",
      configDefault: "global",
    });
    assert.equal(result, "agent:bs", "Non-template config delegates to scopeManager.getDefaultScope(agentId)");
  });

  it("resolveHookReadScopes with static config delegates to getAccessibleScopes", () => {
    const mgr = createScopeManager(cfg.scopes);
    const result = resolveHookReadScopes({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x",
      configDefault: "global",
    });
    // Should match getAccessibleScopes output (order may differ)
    assert.deepEqual([...result].sort(), ["agent:bs", "global", "reflection:agent:bs"]);
  });

  it("undefined configDefault → resolveHookDefaultScope still returns agent:<id>", () => {
    const mgr = createScopeManager(cfg.scopes);
    const result = resolveHookDefaultScope({
      scopeManager: mgr,
      agentId: "bs",
      sessionKey: "agent:bs:x",
      configDefault: undefined,
    });
    assert.equal(result, "agent:bs");
  });

  it("Bypass agent always returns 'global' regardless of config", () => {
    const mgr = createScopeManager(cfg.scopes);
    assert.equal(
      resolveHookDefaultScope({
        scopeManager: mgr, agentId: "system", sessionKey: "agent:system:x", configDefault: "global",
      }),
      "global",
    );
    assert.deepEqual(
      resolveHookReadScopes({
        scopeManager: mgr, agentId: "system", sessionKey: "agent:system:x", configDefault: "global",
      }),
      ["global"],
    );
  });
});
