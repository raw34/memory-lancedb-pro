import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
