import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jitiFactory from "jiti";
const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const { extractConvKey, resolveTemplate } = jiti("../index.ts");

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
