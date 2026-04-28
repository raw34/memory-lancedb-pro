import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { matchesScopePattern, isWildcardPattern, MemoryScopeManager } = jiti("../src/scopes.ts");

describe("isWildcardPattern", () => {
  it("returns true for strings ending with *", () => {
    assert.equal(isWildcardPattern("agent:bs:conv:*"), true);
    assert.equal(isWildcardPattern("*"), true);
  });
  it("returns false for plain literals", () => {
    assert.equal(isWildcardPattern("global"), false);
    assert.equal(isWildcardPattern("agent:bs:conv:discord:456"), false);
  });
  it("returns false for mid-segment * (not a real wildcard)", () => {
    assert.equal(isWildcardPattern("a*b"), false);
  });
});

describe("matchesScopePattern", () => {
  it("literal pattern equals strict equality", () => {
    assert.equal(matchesScopePattern("global", "global"), true);
    assert.equal(matchesScopePattern("global", "other"), false);
  });
  it("trailing * matches any suffix", () => {
    assert.equal(matchesScopePattern("agent:bs:conv:abc", "agent:bs:conv:*"), true);
    assert.equal(matchesScopePattern("agent:bs:conv:discord:channel:456", "agent:bs:conv:*"), true);
  });
  it("trailing * does NOT match the prefix without suffix", () => {
    assert.equal(matchesScopePattern("agent:bs:conv", "agent:bs:conv:*"), false);
    assert.equal(matchesScopePattern("agent:bs:conv:", "agent:bs:conv:*"), true); // empty suffix is still suffix
  });
  it("'*' alone matches any non-empty scope", () => {
    assert.equal(matchesScopePattern("anything", "*"), true);
    assert.equal(matchesScopePattern("a:b:c:d", "*"), true);
    assert.equal(matchesScopePattern("", "*"), false);
  });
  it("treats regex metachars in literal portion as literal characters", () => {
    assert.equal(matchesScopePattern("a.b", "a.b"), true);
    assert.equal(matchesScopePattern("aXb", "a.b"), false);  // . is literal not regex .
    assert.equal(matchesScopePattern("a+b", "a+b"), true);
  });
  it("rejects mid-segment wildcards (only trailing * supported)", () => {
    // mid-segment '*' is treated as literal '*' character (not wildcard)
    assert.equal(matchesScopePattern("a*b", "a*b"), true);
    assert.equal(matchesScopePattern("aXb", "a*b"), false);
  });
});

describe("non-string input handling", () => {
  it("matchesScopePattern returns false for non-string inputs", () => {
    assert.equal(matchesScopePattern(undefined, "global"), false);
    assert.equal(matchesScopePattern("global", null), false);
    assert.equal(matchesScopePattern(123, "*"), false);
  });
  it("isWildcardPattern returns false for non-string inputs", () => {
    assert.equal(isWildcardPattern(null), false);
    assert.equal(isWildcardPattern(undefined), false);
    assert.equal(isWildcardPattern(123), false);
  });
});

describe("MemoryScopeManager.isAccessible with wildcard agentAccess", () => {
  const mgr = new MemoryScopeManager({
    default: "global",
    definitions: { global: { description: "" } },
    agentAccess: {
      "monitor": ["global", "agent:bs:conv:*"],
    },
  });

  it("agent with wildcard ACL can access matching scope", () => {
    assert.equal(mgr.isAccessible("agent:bs:conv:discord:456", "monitor"), true);
    assert.equal(mgr.isAccessible("agent:bs:conv:other", "monitor"), true);
  });
  it("agent with wildcard ACL cannot access non-matching scope", () => {
    assert.equal(mgr.isAccessible("agent:other:conv:x", "monitor"), false);
    assert.equal(mgr.isAccessible("agent:bs", "monitor"), false);  // missing :conv: suffix
  });
  it("agent with literal ACL keeps strict equality", () => {
    const m = new MemoryScopeManager({
      default: "global",
      definitions: { global: { description: "" } },
      agentAccess: { "x": ["global", "agent:y"] },
    });
    assert.equal(m.isAccessible("agent:y", "x"), true);
    assert.equal(m.isAccessible("agent:y:z", "x"), false);
  });
});

describe("validateScopeFormat allows trailing *", () => {
  const mgr = new MemoryScopeManager();
  // We exercise validateScopeFormat indirectly via addScopeDefinition (which calls it)
  it("accepts 'agent:bs:conv:*' as valid pattern", () => {
    assert.doesNotThrow(() => mgr.addScopeDefinition("agent:bs:conv:*", { description: "" }));
  });
  it("accepts plain '*' as valid pattern", () => {
    assert.doesNotThrow(() => mgr.addScopeDefinition("*", { description: "" }));
  });
  it("rejects mid-segment wildcards like 'a*b'", () => {
    assert.throws(() => mgr.addScopeDefinition("a*b", { description: "" }), /Invalid scope format/);
  });
  it("rejects multiple wildcards like 'a:*:b:*'", () => {
    assert.throws(() => mgr.addScopeDefinition("a:*:b:*", { description: "" }), /Invalid scope format/);
  });
});
