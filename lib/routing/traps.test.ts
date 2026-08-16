/**
 * One test per named trap, named after the trap.
 *
 * These are not extra coverage for the modules above — they are the corpus
 * asserting that the specific defects it was authored to contain are still
 * there and still caught. If someone "tidies up" the inherited ruleset, these
 * fail loudly and say which story disappeared.
 */

import { describe, expect, it } from "vitest";
import { INHERITED_RULESET, LEADS, ORG, QUEUE_CATCHALL } from "@/data";
import { analyze } from "./analyze";
import { blastRadius, withRuleDisabled } from "./diff";
import { observe } from "./empirical";
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
const results = new Map(routeAllPure(LEADS, config).map((result) => [result.leadId, result]));

const proofsFor = (ruleId: string) =>
  analysis.proofs.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.kind);

describe("trap: the dead rule", () => {
  it("names France enterprise as unreachable, and deleting it moves nobody", () => {
    // Marie asked for it in month nine. The global enterprise rule from month
    // three already takes every lead it describes.
    expect(proofsFor("rl-france-enterprise")).toContain("UNREACHABLE");
    expect(analysis.effective["rl-france-enterprise"]).toEqual([]);

    const radius = blastRadius(
      LEADS,
      config,
      INHERITED_RULESET,
      withRuleDisabled(INHERITED_RULESET, "rl-france-enterprise"),
    );
    expect(radius.moved).toEqual([]);

    // And it never wins a corpus lead either — the proof and the observation
    // agree, which they should, because one implies the other in this direction.
    const winners = [...results.values()].filter(
      (result) => result.winningRuleId === "rl-france-enterprise",
    );
    expect(winners).toEqual([]);
  });
});

describe("trap: the enrichment gap", () => {
  it("marks headcount rules as unable to fire before enrichment, and the leads prove it", () => {
    expect(proofsFor("rl-enterprise")).toContain("ENRICHMENT_DEPENDENT");
    expect(proofsFor("rl-emea-mid")).toContain("ENRICHMENT_DEPENDENT");

    // A lead with no headcount yet falls past every mid-market and enterprise
    // rule, no matter how large the company actually is.
    const unenriched = LEADS.filter((lead) => lead.employees === null);
    expect(unenriched.length).toBeGreaterThan(0);
    for (const lead of unenriched) {
      const result = results.get(lead.id);
      expect(result?.matchedRuleIds).not.toContain("rl-enterprise");
      expect(result?.matchedRuleIds).not.toContain("rl-emea-mid");
    }
  });
});

describe("trap: the silent contest", () => {
  it("shows the partner desk beating Enterprise on line order alone", () => {
    const contest = analysis.proofs.find(
      (finding) => finding.kind === "CONTESTED" && finding.ruleId === "rl-partner-referral",
    );
    expect(contest).toBeDefined();
    expect(contest?.relatedRuleIds).toContain("rl-c-level");

    // l-035 is a C-level partner referral: both rules match, the partner rule
    // wins, and the only reason is that it was written first.
    const result = results.get("l-035");
    expect(result?.matchedRuleIds).toEqual(
      expect.arrayContaining(["rl-partner-referral", "rl-c-level"]),
    );
    expect(result?.winningRuleId).toBe("rl-partner-referral");

    const observed = observations.find(
      (finding) =>
        finding.kind === "CONTESTED_IN_PRACTICE" && finding.ruleId === "rl-partner-referral",
    );
    expect(observed?.leadIds).toContain("l-035");
  });
});

describe("trap: the hole", () => {
  it("describes regulated companies under fifty people, and counts who fell in", () => {
    const holes = analysis.proofs.filter((finding) => finding.kind === "UNCOVERED");
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.map((hole) => hole.detail).join(" ")).toMatch(/healthcare, government/);

    // The hole is a consequence, not a placement: the specialist desk starts at
    // fifty and the regional rules were amended to get out of its way.
    // The guard rules above the geography still apply: a C-level lead or a
    // partner referral is caught before it can reach the hole. The hole is what
    // is left after them.
    const smallRegulated = LEADS.filter(
      (lead) =>
        (lead.industry === "healthcare" || lead.industry === "government") &&
        lead.employees !== null &&
        lead.employees < 50 &&
        lead.seniority !== "c_level" &&
        lead.source !== "partner_referral" &&
        !lead.competitor &&
        !lead.existingCustomer,
    );
    expect(smallRegulated).toHaveLength(11);
    for (const lead of smallRegulated) {
      const result = results.get(lead.id);
      expect(result?.outcome).toBe("FALLBACK");
      expect(result?.winningRuleId).toBeNull();
    }

    const observed = observations.filter((finding) => finding.kind === "UNCOVERED_IN_PRACTICE");
    const counted = new Set(observed.flatMap((finding) => finding.leadIds));
    for (const lead of smallRegulated) expect(counted).toContain(lead.id);
  });
});

describe("trap: the departed owner", () => {
  it("blocks rather than falling through when pre-emption resolves to a ghost", () => {
    const hana = ORG.reps.find((rep) => rep.id === "r-hana");
    expect(hana?.active).toBe(false);
    expect(ORG.accounts.find((a) => a.domain === "bergstrom-health.example")?.ownerId).toBe(
      "r-hana",
    );

    for (const leadId of ["l-009", "l-010"]) {
      const result = results.get(leadId);
      expect(result?.outcome).toBe("BLOCKED");
      expect(result?.blockedReason).toBe("DEPARTED_ACCOUNT_OWNER");
      // The rules never ran. Falling through would have hidden the black hole.
      expect(result?.matchedRuleIds).toEqual([]);
      expect(result?.eligibleRepIds).toEqual([]);
    }
  });

  it("also catches the rule-level version — a target no active rep satisfies", () => {
    expect(proofsFor("rl-japan-german")).toContain("NO_ELIGIBLE_OWNER");
    const result = results.get("l-038");
    expect(result?.winningRuleId).toBe("rl-japan-german");
    expect(result?.outcome).toBe("BLOCKED");
    expect(result?.blockedReason).toBe("EMPTY_TARGET");
  });
});

describe("trap: the vanity rule", () => {
  it("calls France SMB redundant: it fires, and deleting it changes nothing", () => {
    expect(proofsFor("rl-france-smb")).toContain("REDUNDANT");
    expect(proofsFor("rl-france-smb")).not.toContain("UNREACHABLE");

    // The distinction that makes REDUNDANT worth having as its own finding: this
    // rule does win leads. It just wins them for nobody's benefit.
    const winners = [...results.values()].filter(
      (result) => result.winningRuleId === "rl-france-smb",
    );
    expect(winners.length).toBeGreaterThan(0);

    const radius = blastRadius(
      LEADS,
      config,
      INHERITED_RULESET,
      withRuleDisabled(INHERITED_RULESET, "rl-france-smb"),
    );
    expect(radius.moved).toEqual([]);
    expect(radius.unchangedCount).toBe(LEADS.length);
  });
});

describe("bonus trap: the transposed bounds", () => {
  it("catches a rule whose interval was typed backwards", () => {
    expect(proofsFor("rl-iberia-midmarket")).toContain("UNSATISFIABLE");
    expect(analysis.effective["rl-iberia-midmarket"]).toEqual([]);
  });
});
