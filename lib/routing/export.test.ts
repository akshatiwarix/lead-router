import { describe, expect, it } from "vitest";
import { INHERITED_RULESET, LEADS, ORG, PRESETS, QUEUE_CATCHALL } from "@/data";
import { assignmentsToCsv, decodeRuleset, encodeRuleset } from "./export";
import { routeAll, type RoutingConfig } from "./route";
import { createSelector } from "./select";

const config: RoutingConfig = {
  ruleset: INHERITED_RULESET,
  org: ORG,
  fallbackQueueId: QUEUE_CATCHALL,
};

const assignments = routeAll(LEADS, config, createSelector("FIRST_ELIGIBLE", ORG));

const context = {
  leadName: (id: string) => LEADS.find((lead) => lead.id === id)?.name ?? id,
  company: (id: string) => LEADS.find((lead) => lead.id === id)?.company ?? id,
  emailDomain: (id: string) => LEADS.find((lead) => lead.id === id)?.emailDomain ?? id,
  ruleName: (id: string) => INHERITED_RULESET.rules.find((rule) => rule.id === id)?.name ?? id,
  repName: (id: string) => ORG.reps.find((rep) => rep.id === id)?.name ?? id,
  queueName: (id: string) => ORG.queues.find((queue) => queue.id === id)?.name ?? id,
};

describe("permalink", () => {
  it("round-trips every preset", () => {
    for (const ruleset of PRESETS) {
      const result = decodeRuleset(encodeRuleset(ruleset));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.ruleset).toEqual(ruleset);
    }
  });

  it("survives being put in a URL", () => {
    const encoded = encodeRuleset(INHERITED_RULESET);
    const url = new URL(`https://example.test/?r=${encoded}`);
    const back = url.searchParams.get("r");
    expect(back).not.toBeNull();
    expect(decodeRuleset(encodeURIComponent(back!)).ok).toBe(true);
  });

  it("refuses garbage with a message rather than a half-loaded console", () => {
    const result = decodeRuleset("not-a-ruleset");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be decoded/);
  });

  it("puts a hand-edited link through the same schema as the shipped corpus", () => {
    const tampered = encodeRuleset({
      ...INHERITED_RULESET,
      rules: [
        {
          id: "evil",
          name: "Leads from Atlantis",
          // "AT" is not in the country domain. A permalink is untrusted input.
          when: { country: { kind: "in", values: ["AT"] } },
          target: { kind: "queue", queueId: QUEUE_CATCHALL },
          enabled: true,
        },
      ],
    });
    const result = decodeRuleset(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/country/);
  });
});

describe("CSV", () => {
  const csv = assignmentsToCsv(assignments, context);
  const lines = csv.split("\n");

  it("has a header and one row per lead", () => {
    expect(lines).toHaveLength(LEADS.length + 1);
    expect(lines[0]).toContain("outcome");
    expect(lines[0]).toContain("also_matched");
  });

  it("never writes an empty cell where something is absent", () => {
    // An empty cell and "nothing happened" are different facts. Conflating them
    // is how a routing defect survives a quarter inside a spreadsheet.
    for (const line of lines.slice(1)) {
      expect(line).not.toMatch(/,,/);
      expect(line).not.toMatch(/,$/);
    }
  });

  it("distinguishes a lead a rep won from a lead pre-empted onto them", () => {
    const preempted = lines.find((line) => line.startsWith("l-001,"));
    expect(preempted).toContain("PREEMPTED");
    expect(preempted).toContain("northwind-labs.example");
    expect(preempted).toContain("no rule matched");
  });

  it("keeps the losing rules, not just the winner", () => {
    const contested = lines.find((line) => line.startsWith("l-035,"));
    expect(contested).toContain("Partner referrals to the partner desk");
    expect(contested).toContain("Anything C-level goes to Enterprise");
  });

  it("says nobody rather than leaving a blank when a lead is blocked", () => {
    const blocked = lines.find((line) => line.startsWith("l-009,"));
    expect(blocked).toContain("BLOCKED");
    expect(blocked).toContain("DEPARTED_ACCOUNT_OWNER");
    expect(blocked).toContain("nobody");
  });

  it("quotes cells that contain a comma", () => {
    // Rep lists are pipe-separated for exactly this reason, but rule names are
    // free text and one of them could acquire a comma tomorrow.
    const rows = assignmentsToCsv(assignments, {
      ...context,
      ruleName: () => "Enterprise, but only sometimes",
    }).split("\n");
    expect(rows.some((row) => row.includes('"Enterprise, but only sometimes"'))).toBe(true);
  });
});
