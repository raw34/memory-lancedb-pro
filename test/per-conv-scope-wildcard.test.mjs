import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { matchesScopePattern, isWildcardPattern } = jiti("../src/scopes.ts");

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
