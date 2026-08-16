import { describe, expect, it } from "vitest";
import { ORG, PRESETS, QUEUE_CATCHALL } from "@/data";
import { analyze } from "./analyze";
import { buildGrid } from "./grid";
import type { Ruleset, StaticFindingKind } from "./types";

const preset = (id: string): Ruleset => {
  const found = PRESETS.find((ruleset) => ruleset.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return found;
};

const run = (ruleset: Ruleset) => analyze(ruleset, ORG, buildGrid(ruleset));

const kindsFor = (ruleset: Ruleset, ruleId: string): StaticFindingKind[] =>
  run(ruleset)
    .proofs.filter((finding) => finding.ruleId === ruleId)
    .map((finding) => finding.kind);

describe("the clean ruleset", () => {
  const analysis = run(preset("rs-clean"));

  it("has nothing broken and nothing suspect", () => {
    expect(analysis.proofs.filter((finding) => finding.severity !== "NOTE")).toEqual([]);
  });

  it("leaves no uncovered region", () => {
    expect(analysis.uncovered).toEqual([]);
  });

  it("still carries notes, because a well-formed ruleset is not a silent one", () => {
    // Every geographic rule needs a country, and enrichment does not always
    // have one yet. That is worth saying even about a ruleset with no defects —
    // a panel that only ever speaks when something is broken teaches the reader
    // that silence means correctness.
    const kinds = new Set(analysis.proofs.map((finding) => finding.kind));
    expect(kinds).toEqual(new Set(["ENRICHMENT_DEPENDENT"]));
  });
});

describe("UNREACHABLE", () => {
  it("names the rule that can never fire and who took it", () => {
    const analysis = run(preset("rs-shadowed"));
    const dead = analysis.proofs.find((finding) => finding.kind === "UNREACHABLE");
    expect(dead?.ruleId).toBe("s-germany-enterprise");
    expect(dead?.relatedRuleIds).toContain("s-enterprise");
  });

  it("leaves that rule with an empty effective region", () => {
    const analysis = run(preset("rs-shadowed"));
    expect(analysis.effective["s-germany-enterprise"]).toEqual([]);
  });

  it("does not fire for a rule that merely overlaps", () => {
    const analysis = run(preset("rs-contested"));
    expect(analysis.proofs.filter((finding) => finding.kind === "UNREACHABLE")).toEqual([]);
  });
});

describe("CONTESTED", () => {
  const analysis = run(preset("rs-contested"));

  it("reports the pair and says order is what decided", () => {
    const contest = analysis.proofs.find((finding) => finding.kind === "CONTESTED");
    expect(contest?.ruleId).toBe("x-partner");
    expect(contest?.relatedRuleIds).toEqual(["x-enterprise"]);
    expect(contest?.detail).toMatch(/higher in the list/);
  });

  it("says nothing about a trailing catch-all", () => {
    // `when: {}` overlaps every rule above it by construction. Reporting that
    // would fire on every well-formed ruleset and teach the reader to ignore
    // the finding that matters.
    const clean = run(preset("rs-clean"));
    expect(clean.proofs.filter((f) => f.kind === "CONTESTED")).toEqual([]);
  });

  it("says nothing about a specific rule written above a general one", () => {
    // France-above-EMEA is deliberate: the author knows EMEA would also match.
    // A contest is a *partial* overlap, where neither rule refines the other.
    const idiomatic: Ruleset = {
      id: "rs-idiom",
      name: "idiom",
      description: "",
      rules: [
        {
          id: "i1",
          name: "France to Marie",
          when: { country: { kind: "in", values: ["FR"] } },
          target: { kind: "rep", repId: "r-marie" },
          enabled: true,
        },
        {
          id: "i2",
          name: "EMEA to the team",
          when: { country: { kind: "in", values: ["FR", "DE", "UK"] } },
          target: { kind: "team", teamId: "t-emea" },
          enabled: true,
        },
      ],
    };
    expect(run(idiomatic).proofs.filter((f) => f.kind === "CONTESTED")).toEqual([]);
  });

  it("says nothing about two rules that agree on the owner", () => {
    const agreeing: Ruleset = {
      id: "rs-agree",
      name: "agree",
      description: "",
      rules: [
        {
          id: "a1",
          name: "France",
          when: { country: { kind: "in", values: ["FR"] } },
          target: { kind: "team", teamId: "t-emea" },
          enabled: true,
        },
        {
          id: "a2",
          name: "EMEA",
          when: { country: { kind: "in", values: ["FR", "DE"] } },
          target: { kind: "team", teamId: "t-emea" },
          enabled: true,
        },
      ],
    };
    expect(run(agreeing).proofs.filter((f) => f.kind === "CONTESTED")).toEqual([]);
  });
});

describe("UNCOVERED", () => {
  it("describes the hole rather than counting it", () => {
    const analysis = run(preset("rs-uncovered"));
    const holes = analysis.proofs.filter((finding) => finding.kind === "UNCOVERED");
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.map((hole) => hole.detail).join(" ")).toMatch(/employees unenriched/);
  });

  it("never puts a percentage of lead-space in a finding", () => {
    // Atom count is not lead volume. A percentage here would be a score in
    // disguise, and would be false for every real funnel.
    for (const ruleset of PRESETS) {
      for (const proof of run(ruleset).proofs) {
        expect(proof.detail).not.toMatch(/%/);
      }
    }
  });
});

describe("REDUNDANT", () => {
  it("fires when a later rule sends the same leads to the same people", () => {
    expect(kindsFor(preset("rs-inherited"), "rl-france-smb")).toContain("REDUNDANT");
  });

  it("does not fire when the later rule disagrees about the owner", () => {
    const disagreeing: Ruleset = {
      id: "rs-disagree",
      name: "disagree",
      description: "",
      rules: [
        {
          id: "d1",
          name: "France to EMEA",
          when: { country: { kind: "in", values: ["FR"] } },
          target: { kind: "team", teamId: "t-emea" },
          enabled: true,
        },
        {
          id: "d2",
          name: "Everything to Enterprise",
          when: {},
          target: { kind: "team", teamId: "t-ent" },
          enabled: true,
        },
      ],
    };
    expect(run(disagreeing).proofs.filter((f) => f.kind === "REDUNDANT")).toEqual([]);
  });

  it("does not fire when the leads would fall to the catch-all instead", () => {
    const lonely: Ruleset = {
      id: "rs-lonely",
      name: "lonely",
      description: "",
      rules: [
        {
          id: "o1",
          name: "France to EMEA",
          when: { country: { kind: "in", values: ["FR"] } },
          target: { kind: "team", teamId: "t-emea" },
          enabled: true,
        },
      ],
    };
    expect(run(lonely).proofs.filter((f) => f.kind === "REDUNDANT")).toEqual([]);
  });
});

describe("the inherited ruleset", () => {
  const analysis = run(preset("rs-inherited"));
  const kinds = new Set(analysis.proofs.map((finding) => finding.kind));

  it("reaches all eight static findings", () => {
    expect(kinds).toEqual(
      new Set<StaticFindingKind>([
        "UNSATISFIABLE",
        "UNREACHABLE",
        "PARTIALLY_SHADOWED",
        "REDUNDANT",
        "CONTESTED",
        "UNCOVERED",
        "ENRICHMENT_DEPENDENT",
        "NO_ELIGIBLE_OWNER",
      ]),
    );
  });

  it("catches the transposed interval bounds", () => {
    expect(kindsFor(preset("rs-inherited"), "rl-iberia-midmarket")).toContain("UNSATISFIABLE");
  });

  it("catches the France enterprise rule the global one already took", () => {
    expect(kindsFor(preset("rs-inherited"), "rl-france-enterprise")).toContain("UNREACHABLE");
  });

  it("catches the rule that resolves to a rep who left", () => {
    expect(kindsFor(preset("rs-inherited"), "rl-japan-german")).toContain("NO_ELIGIBLE_OWNER");
  });

  it("marks headcount rules as unable to fire before enrichment", () => {
    expect(kindsFor(preset("rs-inherited"), "rl-enterprise")).toContain("ENRICHMENT_DEPENDENT");
  });

  it("does not mark an unconstrained field as enrichment-dependent", () => {
    // `rl-competitor` constrains only `competitor`, which is known at capture.
    expect(kindsFor(preset("rs-inherited"), "rl-competitor")).not.toContain("ENRICHMENT_DEPENDENT");
  });

  it("finds the regulated-SMB hole", () => {
    const holes = analysis.proofs
      .filter((finding) => finding.kind === "UNCOVERED")
      .map((finding) => finding.detail)
      .join(" ");
    expect(holes).toMatch(/healthcare/);
  });
});

describe("stability", () => {
  it("is unaffected by capacity", () => {
    // Decision 19. If a load figure could move a finding, the findings would be
    // statements about one afternoon rather than about the ruleset.
    const zero = { ...ORG, reps: ORG.reps.map((rep) => ({ ...rep, capacity: 0 })) };
    const huge = { ...ORG, reps: ORG.reps.map((rep) => ({ ...rep, capacity: 10_000 })) };
    const ruleset = preset("rs-inherited");
    const grid = buildGrid(ruleset);
    expect(JSON.stringify(analyze(ruleset, zero, grid).proofs)).toBe(
      JSON.stringify(analyze(ruleset, huge, grid).proofs),
    );
  });

  it("is identical across repeated runs", () => {
    const ruleset = preset("rs-inherited");
    const first = JSON.stringify(run(ruleset).proofs);
    for (let i = 0; i < 20; i++) expect(JSON.stringify(run(ruleset).proofs)).toBe(first);
  });

  it("ignores disabled rules but keeps the grid stable", () => {
    const ruleset = preset("rs-shadowed");
    const withDisabled: Ruleset = {
      ...ruleset,
      rules: ruleset.rules.map((rule) =>
        rule.id === "s-germany-enterprise" ? { ...rule, enabled: false } : rule,
      ),
    };
    expect(buildGrid(withDisabled).atoms).toEqual(buildGrid(ruleset).atoms);
    expect(run(withDisabled).proofs.filter((f) => f.kind === "UNREACHABLE")).toEqual([]);
  });
});

describe("queues", () => {
  it("does not call a queue target an empty owner set", () => {
    // Nobody is eligible for a queue by construction; reporting that as a black
    // hole would fire on every well-formed ruleset.
    const queued: Ruleset = {
      id: "rs-queued",
      name: "queued",
      description: "",
      rules: [
        {
          id: "q1",
          name: "Everything to the catch-all",
          when: {},
          target: { kind: "queue", queueId: QUEUE_CATCHALL },
          enabled: true,
        },
      ],
    };
    expect(run(queued).proofs.filter((f) => f.kind === "NO_ELIGIBLE_OWNER")).toEqual([]);
  });
});
