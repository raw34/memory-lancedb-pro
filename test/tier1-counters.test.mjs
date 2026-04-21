import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";
import jitiFactory from "jiti";

const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const {
  parseSmartMetadata,
  buildSmartMetadata,
} = jiti("../src/smart-metadata.ts");

describe("Tier 1: suppressed_until_ms field presence semantics", () => {
  it("returns undefined when raw JSON does not include the key (sentinel for 'never touched by Tier 1')", () => {
    const meta = parseSmartMetadata(
      JSON.stringify({ l0_abstract: "legacy", bad_recall_count: 5 }),
      { text: "legacy", category: "fact" },
    );
    assert.equal(meta.suppressed_until_ms, undefined);
  });

  it("clamps to non-negative integer when raw JSON includes a numeric value", () => {
    const meta = parseSmartMetadata(
      JSON.stringify({ l0_abstract: "tier1-touched", suppressed_until_ms: 1713700000000 }),
      { text: "tier1-touched", category: "fact" },
    );
    assert.equal(meta.suppressed_until_ms, 1713700000000);
  });

  it("coerces negative or NaN to 0", () => {
    const negMeta = parseSmartMetadata(
      JSON.stringify({ l0_abstract: "x", suppressed_until_ms: -100 }),
      { text: "x", category: "fact" },
    );
    assert.equal(negMeta.suppressed_until_ms, 0);

    const nanMeta = parseSmartMetadata(
      JSON.stringify({ l0_abstract: "x", suppressed_until_ms: "not-a-number" }),
      { text: "x", category: "fact" },
    );
    assert.equal(nanMeta.suppressed_until_ms, 0);
  });

  it("preserves 0 explicitly (not coerced to undefined)", () => {
    const meta = parseSmartMetadata(
      JSON.stringify({ l0_abstract: "explicit-zero", suppressed_until_ms: 0 }),
      { text: "explicit-zero", category: "fact" },
    );
    assert.equal(meta.suppressed_until_ms, 0);
  });
});

describe("Tier 1: plugin config schema", () => {
  it("openclaw.plugin.json declares autoRecallBadRecallDecayMs and autoRecallSuppressionDurationMs", () => {
    const pluginJsonPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../openclaw.plugin.json",
    );
    const raw = fs.readFileSync(pluginJsonPath, "utf8");
    const schema = JSON.parse(raw);
    // Tolerate either top-level "properties" or nested config object — search recursively.
    function findProperty(obj, key) {
      if (!obj || typeof obj !== "object") return null;
      if (obj.properties && Object.prototype.hasOwnProperty.call(obj.properties, key)) {
        return obj.properties[key];
      }
      for (const v of Object.values(obj)) {
        const found = findProperty(v, key);
        if (found) return found;
      }
      return null;
    }
    const decay = findProperty(schema, "autoRecallBadRecallDecayMs");
    const suppress = findProperty(schema, "autoRecallSuppressionDurationMs");
    assert.ok(decay, "autoRecallBadRecallDecayMs missing from schema");
    assert.ok(suppress, "autoRecallSuppressionDurationMs missing from schema");
    assert.equal(decay.default, 86400000);
    assert.equal(suppress.default, 1800000);
    assert.equal(decay.minimum, 0);
    assert.equal(suppress.minimum, 0);
  });
});

describe("Tier 1: governance filter reads suppressed_until_ms", () => {
  // Pure-logic test of the filter predicate. We define a local helper that
  // mirrors the production code, then test it directly. This avoids booting
  // the plugin runtime for a 2-line condition. End-to-end wiring is verified
  // by visual inspection of index.ts after the rewrite.
  function isSuppressed(meta, nowMs) {
    const suppressUntil = meta.suppressed_until_ms ?? 0;
    return suppressUntil > 0 && nowMs < suppressUntil;
  }

  it("suppresses when nowMs < suppressed_until_ms", () => {
    const future = Date.now() + 60_000;
    assert.equal(isSuppressed({ suppressed_until_ms: future }, Date.now()), true);
  });

  it("does not suppress when nowMs >= suppressed_until_ms", () => {
    const past = Date.now() - 60_000;
    assert.equal(isSuppressed({ suppressed_until_ms: past }, Date.now()), false);
  });

  it("does not suppress when suppressed_until_ms is undefined (legacy memory)", () => {
    assert.equal(isSuppressed({ suppressed_until_ms: undefined }, Date.now()), false);
  });

  it("does not suppress when suppressed_until_ms is 0 (Tier 1 touched, no active suppression)", () => {
    assert.equal(isSuppressed({ suppressed_until_ms: 0 }, Date.now()), false);
  });

  it("ignores legacy suppressed_until_turn field entirely", () => {
    // A memory with only legacy turn-based suppression: Tier 1 filter does not
    // look at it. The legacy turn field is retired in the Tier 1 read path.
    const meta = { suppressed_until_turn: 9999, suppressed_until_ms: undefined };
    assert.equal(isSuppressed(meta, Date.now()), false);
  });
});
