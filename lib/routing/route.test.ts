import { describe, expect, it } from "vitest";
import { ORG, INHERITED_RULESET, LEADS, QUEUE_CATCHALL, QUEUE_DO_NOT_ROUTE } from "@/data";
import { eligibleReps, routeAllPure, routePure, type RoutingConfig } from "./route";
import { createSelector } from "./select";
import { routeAll } from "./route";
import type { Lead } from "./types";

const config: RoutingConfig = {
  ruleset: INHERITED_RULESET,
  org: ORG,
  fallbackQueueId: QUEUE_CATCHALL,
};

const byId = (id: string) => {
  const lead = LEADS.find((candidate) => candidate.id === id);
  if (!lead) throw new Error(`no lead ${id}`);
  return lead;
};

const route = (lead: Lead) => routePure(lead, config);

describe("eligibleReps", () => {
  it("resolves a team to its active members only", () => {
    const ids = eligibleReps({ kind: "team", teamId: "t-ent" }, ORG).map((rep) => rep.id);
    expect(ids).toContain("r-noor");
    expect(ids).not.toContain("r-hana"); // departed
  });

  it("resolves a departed rep target to nobody", () => {
    expect(eligibleReps({ kind: "rep", repId: "r-hana" }, ORG)).toEqual([]);
  });

  it("resolves a queue to nobody, because a queue is not a person", () => {
    expect(eligibleReps({ kind: "queue", queueId: QUEUE_CATCHALL }, ORG)).toEqual([]);
  });

  it("intersects every attribute clause it is given", () => {
    const emeaSaas = eligibleReps(
      { kind: "attributes", territory: ["FR"], specialties: ["saas"] },
      ORG,
    ).map((rep) => rep.id);
    expect(emeaSaas).toEqual(["r-marie", "r-noor"]);
  });

  it("finds nobody for a Japanese territory that also needs German", () => {
    // Not "no lead has asked yet" — no active rep could ever serve it. That is
    // the difference between an observation and a proof.
    expect(eligibleReps({ kind: "attributes", territory: ["JP"], languages: ["de"] }, ORG)).toEqual(
      [],
    );
  });

  it("ignores capacity entirely", () => {
    const zeroed = { ...ORG, reps: ORG.reps.map((rep) => ({ ...rep, capacity: 0 })) };
    expect(eligibleReps({ kind: "team", teamId: "t-emea" }, zeroed).map((r) => r.id)).toEqual(
      eligibleReps({ kind: "team", teamId: "t-emea" }, ORG).map((r) => r.id),
    );
  });
});

describe("pre-emption", () => {
  it("beats every rule in the list", () => {
    const result = route(byId("l-001"));
    expect(result.outcome).toBe("PREEMPTED");
    expect(result.preemptedByAccount).toBe("northwind-labs.example");
    expect(result.eligibleRepIds).toEqual(["r-marie"]);
    expect(result.winningRuleId).toBeNull();
    expect(result.matchedRuleIds).toEqual([]); // the rules never ran
  });

  it("blocks rather than falling through when the account owner has left", () => {
    const result = route(byId("l-009"));
    expect(result.outcome).toBe("BLOCKED");
    expect(result.blockedReason).toBe("DEPARTED_ACCOUNT_OWNER");
    expect(result.preemptedByAccount).toBe("bergstrom-health.example");
    expect(result.eligibleRepIds).toEqual([]);
  });

  it("does not fire for a known account with no owner", () => {
    const result = route(byId("l-018")); // quarry-civic.example, ownerId null
    expect(result.preemptedByAccount).toBeNull();
  });
});

describe("matching", () => {
  it("keeps every match, not just the winner", () => {
    const result = route(byId("l-035")); // partner referral AND C-level
    expect(result.matchedRuleIds).toContain("rl-partner-referral");
    expect(result.matchedRuleIds).toContain("rl-c-level");
    expect(result.winningRuleId).toBe("rl-partner-referral"); // higher in the list
  });

  it("suppresses competitors", () => {
    const result = route(byId("l-011"));
    expect(result.outcome).toBe("SUPPRESSED");
    expect(result.queueId).toBe(QUEUE_DO_NOT_ROUTE);
  });

  it("sends an explicit catch-all rule to FALLBACK with the rule recorded", () => {
    const result = route(byId("l-014")); // existing customer
    expect(result.outcome).toBe("FALLBACK");
    expect(result.winningRuleId).toBe("rl-existing-customer");
    expect(result.queueId).toBe(QUEUE_CATCHALL);
  });

  it("sends an unmatched lead to FALLBACK with no rule recorded", () => {
    const result = route(byId("l-017")); // regulated, under fifty people
    expect(result.outcome).toBe("FALLBACK");
    expect(result.winningRuleId).toBeNull();
    expect(result.matchedRuleIds).toEqual([]);
  });
});

describe("eligibility", () => {
  it("blocks when the winning rule resolves to nobody", () => {
    const result = route(byId("l-038")); // German-speaking Japan
    expect(result.winningRuleId).toBe("rl-japan-german");
    expect(result.outcome).toBe("BLOCKED");
    expect(result.blockedReason).toBe("EMPTY_TARGET");
  });

  it("routes to the whole eligible set, leaving the choice to selection", () => {
    const result = route(byId("l-040")); // FR, 210 people, manufacturing
    expect(result.outcome).toBe("ROUTED");
    expect(result.winningRuleId).toBe("rl-emea-mid");
    expect(result.eligibleRepIds.length).toBeGreaterThan(1);
  });
});

describe("purity", () => {
  it("returns identical results across a hundred runs", () => {
    const first = JSON.stringify(routeAllPure(LEADS, config));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(routeAllPure(LEADS, config))).toBe(first);
    }
  });

  it("is unchanged by capacity, at zero and at ten thousand", () => {
    const at = (capacity: number) =>
      JSON.stringify(
        routeAllPure(LEADS, { ...config, org: { ...ORG, reps: ORG.reps.map((r) => ({ ...r, capacity })) } }),
      );
    expect(at(0)).toBe(at(10_000));
  });

  it("is unchanged by the selection strategy", () => {
    // Selection fills in one field. It must not touch the outcome, the eligible
    // set or the winning rule.
    const strip = (assignments: ReturnType<typeof routeAll>) =>
      JSON.stringify(
        assignments.map((assignment) => ({ ...assignment, selectedRepId: "ignored" })),
      );
    expect(strip(routeAll(LEADS, config, createSelector("FIRST_ELIGIBLE", ORG)))).toBe(
      strip(routeAll(LEADS, config, createSelector("ROUND_ROBIN", ORG))),
    );
  });
});

describe("the corpus reaches every outcome", () => {
  it("produces all five", () => {
    const outcomes = new Set(routeAllPure(LEADS, config).map((result) => result.outcome));
    expect(outcomes).toEqual(
      new Set(["PREEMPTED", "ROUTED", "SUPPRESSED", "BLOCKED", "FALLBACK"]),
    );
  });

  it("blocks for both reasons", () => {
    const reasons = new Set(
      routeAllPure(LEADS, config)
        .map((result) => result.blockedReason)
        .filter((reason): reason is NonNullable<typeof reason> => reason !== null),
    );
    expect(reasons).toEqual(new Set(["DEPARTED_ACCOUNT_OWNER", "EMPTY_TARGET"]));
  });
});
