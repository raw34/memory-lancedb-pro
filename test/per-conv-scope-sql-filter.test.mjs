import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";
const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const {
  scopeFilterToSqlCondition,
  scopeFilterIncludes,
  escapeSqlLikePattern,
} = jiti("../src/store.ts");

describe("scopeFilterToSqlCondition", () => {
  it("undefined returns undefined (no WHERE clause)", () => {
    assert.equal(scopeFilterToSqlCondition(undefined), undefined);
  });
  it("empty array returns explicit deny-all", () => {
    assert.equal(scopeFilterToSqlCondition([]), "'1' = '0'");
  });
  it("single literal uses equality", () => {
    assert.equal(scopeFilterToSqlCondition(["global"]), "scope = 'global'");
  });
  it("multi literals use OR-equality, no LIKE", () => {
    const sql = scopeFilterToSqlCondition(["global", "agent:bs"]);
    assert.equal(sql, "(scope = 'global' OR scope = 'agent:bs')");
  });
  it("wildcard generates LIKE with ESCAPE clause", () => {
    const sql = scopeFilterToSqlCondition(["agent:bs:conv:*"]);
    assert.equal(sql, "scope LIKE 'agent:bs:conv:%' ESCAPE '\\\\'");
  });
  it("mixed literal+wildcard joined with OR", () => {
    const sql = scopeFilterToSqlCondition(["global", "agent:bs:conv:*"]);
    assert.equal(sql, "(scope = 'global' OR scope LIKE 'agent:bs:conv:%' ESCAPE '\\\\')");
  });
  it("escapes _ in literal portion of wildcard pattern", () => {
    const sql = scopeFilterToSqlCondition(["a_b:*"]);
    assert.equal(sql, "scope LIKE 'a\\\\_b:%' ESCAPE '\\\\'");
  });
  it("escapes % in literal portion of wildcard pattern", () => {
    const sql = scopeFilterToSqlCondition(["a%b:*"]);
    assert.equal(sql, "scope LIKE 'a\\\\%b:%' ESCAPE '\\\\'");
  });
});

describe("scopeFilterIncludes (application-layer mirror)", () => {
  it("undefined includes everything", () => {
    assert.equal(scopeFilterIncludes(undefined, "any"), true);
  });
  it("empty array includes nothing", () => {
    assert.equal(scopeFilterIncludes([], "any"), false);
  });
  it("literal-only filter uses equality", () => {
    assert.equal(scopeFilterIncludes(["global"], "global"), true);
    assert.equal(scopeFilterIncludes(["global"], "other"), false);
  });
  it("wildcard filter matches by pattern", () => {
    assert.equal(scopeFilterIncludes(["agent:bs:conv:*"], "agent:bs:conv:x"), true);
    assert.equal(scopeFilterIncludes(["agent:bs:conv:*"], "other"), false);
  });
  it("filters out non-string entries gracefully (don't throw)", () => {
    assert.equal(scopeFilterIncludes([null, undefined, "global"], "global"), true);
    assert.equal(scopeFilterIncludes([null], "global"), false);
  });
});

describe("escapeSqlLikePattern", () => {
  it("escapes _, %, \\\\", () => {
    assert.equal(escapeSqlLikePattern("a_b%c\\\\d"), "a\\\\_b\\\\%c\\\\\\\\d");
  });
  it("leaves plain text unchanged", () => {
    assert.equal(escapeSqlLikePattern("plain"), "plain");
  });
});
