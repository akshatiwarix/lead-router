import { describe, expect, it } from "vitest";
import { INHERITED_RULESET, LEADS, ORG, QUEUE_CATCHALL } from "@/data";
import { analyze } from "./analyze";
import { observe } from "./empirical";
import { blastRadius, withRuleDisabled } from "./diff";
import { buildGrid } from "./grid";
import { routeAllPure, type RoutingConfig } from "./route";

const config: RoutingConfig = {
  ruleset: INHERITED_RULESET,
  org: ORG,
  fallbackQueueId: QUEUE_CATCHALL,
};

const grid = buildGrid(INHERITED_RULESET);
const analysis = analyze(INHERITED_RULESET, ORG, grid);
const observations = observe(LEADS, INHERITED_RULESET, analysis, config);

describe("observations", () => {
  it("are all labelled as observations, never as proofs", () => {
    expect(observations.every((finding) => finding.class === "OBSERVATION")).toBe(true);
  });

  it("carry lead ids rather than a count the reader has to trust", () => {
    for (const finding of observations) {
      expect(finding.leadIds.length).toBeGreaterThan(0);
      expect(finding.detail).toMatch(new RegExp(`\\b${finding.leadIds.length}\\b`));
    }
  });

  it("never express themselves as a percentage", () => {
    for (const finding of observations) expect(finding.detail).not.toMatch(/%/);
  });

  it("reach all three kinds on the shipped corpus", () => {
    expect(new Set(observations.map((finding) => finding.kind))).toEqual(
      new Set(["UNCOVERED_IN_PRACTICE", "CONTESTED_IN_PRACTICE", "PRE_EMPTED_IN_PRACTICE"]),
    );
  });
});

describe("UNCOVERED_IN_PRACTICE", () => {
  it("counts exactly the leads that fell through to the catch-all with no rule", () => {
    const claimed = new Set(
      observations
        .filter((finding) => finding.kind === "UNCOVERED_IN_PRACTICE")
        .flatMap((finding) => finding.leadIds),
    );
    const actual = new Set(
      routeAllPure(LEADS, config)
        .filter((result) => result.winningRuleId === null && result.outcome === "FALLBACK")
        .map((result) => result.leadId),
    );
    expect(claimed).toEqual(actual);
  });

  it("finds the regulated-SMB leads", () => {
    const ids = observations
      .filter((finding) => finding.kind === "UNCOVERED_IN_PRACTICE")
      .flatMap((finding) => finding.leadIds);
    expect(ids).toContain("l-017"); // Wren Hospital, 32 people, ES
    expect(ids).toContain("l-027"); // Mairie de Roselle, 30 people, FR
  });
});

describe("CONTESTED_IN_PRACTICE", () => {
  it("names leads a contest actually decided, not leads that could have been", () => {
    const contested = observations.filter((finding) => finding.kind === "CONTESTED_IN_PRACTICE");
    const results = new Map(routeAllPure(LEADS, config).map((result) => [result.leadId, result]));
    for (const finding of contested) {
      for (const leadId of finding.leadIds) {
        const result = results.get(leadId);
        expect(result?.winningRuleId).toBe(finding.ruleId);
        expect(result?.matchedRuleIds.length).toBeGreaterThan(1);
      }
    }
  });

  it("catches the partner-referral C-level leads", () => {
    const ids = observations
      .filter((finding) => finding.kind === "CONTESTED_IN_PRACTICE")
      .flatMap((finding) => finding.leadIds);
    expect(ids).toContain("l-035");
  });
});

describe("blast radius", () => {
  it("reports nothing when the ruleset is unchanged", () => {
    const radius = blastRadius(LEADS, config, INHERITED_RULESET, INHERITED_RULESET);
    expect(radius.moved).toEqual([]);
    expect(radius.unchangedCount).toBe(LEADS.length);
  });

  it("moves nobody when an UNREACHABLE rule is deleted", () => {
    // This is the analyser checking itself. If disabling a rule it called dead
    // moves even one lead, the proof was wrong.
    for (const proof of analysis.proofs.filter((f) => f.kind === "UNREACHABLE")) {
      if (!proof.ruleId) continue;
      const radius = blastRadius(
        LEADS,
        config,
        INHERITED_RULESET,
        withRuleDisabled(INHERITED_RULESET, proof.ruleId),
      );
      expect(radius.moved, `disabling ${proof.ruleId} moved leads`).toEqual([]);
    }
  });

  it("moves nobody when a REDUNDANT rule is deleted", () => {
    for (const proof of analysis.proofs.filter((f) => f.kind === "REDUNDANT")) {
      if (!proof.ruleId) continue;
      const radius = blastRadius(
        LEADS,
        config,
        INHERITED_RULESET,
        withRuleDisabled(INHERITED_RULESET, proof.ruleId),
      );
      expect(radius.moved, `disabling ${proof.ruleId} moved leads`).toEqual([]);
    }
  });

  it("moves somebody when a live rule is deleted", () => {
    const radius = blastRadius(
      LEADS,
      config,
      INHERITED_RULESET,
      withRuleDisabled(INHERITED_RULESET, "rl-emea-mid"),
    );
    expect(radius.moved.length).toBeGreaterThan(0);
    expect(radius.moved.length + radius.unchangedCount).toBe(LEADS.length);
  });

  it("shows both sides of every move", () => {
    const radius = blastRadius(
      LEADS,
      config,
      INHERITED_RULESET,
      withRuleDisabled(INHERITED_RULESET, "rl-partner-referral"),
    );
    for (const move of radius.moved) {
      expect(move.before.leadId).toBe(move.leadId);
      expect(move.after.leadId).toBe(move.leadId);
      expect(JSON.stringify(move.before)).not.toBe(JSON.stringify(move.after));
    }
  });

  it("is reproducible, because it runs under the reproducible strategy", () => {
    const once = blastRadius(
      LEADS,
      config,
      INHERITED_RULESET,
      withRuleDisabled(INHERITED_RULESET, "rl-emea-mid"),
    );
    for (let i = 0; i < 10; i++) {
      const again = blastRadius(
        LEADS,
        config,
        INHERITED_RULESET,
        withRuleDisabled(INHERITED_RULESET, "rl-emea-mid"),
      );
      expect(JSON.stringify(again)).toBe(JSON.stringify(once));
    }
  });
});
