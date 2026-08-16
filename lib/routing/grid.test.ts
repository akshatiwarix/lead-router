import { describe, expect, it } from "vitest";
import {
  boxContains,
  boxIsEmpty,
  buildGrid,
  conditionBox,
  describeBox,
  describeRegion,
  fullBox,
  intersectBoxes,
  intersectRegions,
  leadAtomIndex,
  normalizeRegion,
  regionContainsLead,
  regionIsEmpty,
  subtractBox,
  subtractRegion,
  unionRegion,
} from "./grid";
import type { Box, Condition, Grid, Lead, Rule, Ruleset } from "./types";
import { FIELD_IDS } from "./types";

const rule = (id: string, when: Condition): Rule => ({
  id,
  name: id,
  when,
  target: { kind: "queue", queueId: "q-default" },
  enabled: true,
});

const ruleset = (...rules: Rule[]): Ruleset => ({
  id: "rs",
  name: "test",
  description: "",
  rules,
});

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "l-1",
  name: "Test Person",
  company: "Test Co",
  emailDomain: "test.example",
  country: "FR",
  employees: 120,
  industry: "saas",
  source: "demo_request",
  seniority: "director",
  language: "fr",
  existingCustomer: false,
  competitor: false,
  ...overrides,
});

/** Atom count of a box, as a product across fields. Used only in tests, as an
 *  independent second opinion on the box algebra. */
function boxAtomCount(box: Box): number {
  return FIELD_IDS.reduce((total, field) => total * box[field].size, 1);
}

function regionAtomCount(region: readonly Box[]): number {
  return region.reduce((total, box) => total + boxAtomCount(box), 0);
}

describe("buildGrid", () => {
  it("cuts numeric domains only where the ruleset actually asks", () => {
    const grid = buildGrid(
      ruleset(
        rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }),
        rule("b", { employees: { kind: "between", lo: 50, hi: 199 } }),
      ),
    );
    expect(grid.atoms.employees).toEqual([
      { kind: "range", lo: 1, hi: 49 },
      { kind: "range", lo: 50, hi: 199 },
      { kind: "range", lo: 200, hi: 500_000 },
      { kind: "missing" },
    ]);
  });

  it("gives a nullable enum one atom per value plus missing, and a non-nullable one none", () => {
    const grid = buildGrid(ruleset());
    expect(grid.atoms.country.at(-1)).toEqual({ kind: "missing" });
    expect(grid.atoms.source.some((atom) => atom.kind === "missing")).toBe(false);
    expect(grid.atoms.competitor).toEqual([
      { kind: "value", value: "false" },
      { kind: "value", value: "true" },
    ]);
  });

  it("does not move a cut point when a rule is disabled", () => {
    // The coordinate system has to survive a toggle. If disabling a rule
    // reshaped the atoms, every finding would jitter for reasons that have
    // nothing to do with what changed.
    const enabled = ruleset(rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }));
    const disabled = ruleset({ ...rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }), enabled: false });
    expect(buildGrid(disabled).atoms.employees).toEqual(buildGrid(enabled).atoms.employees);
  });

  it("ignores an unsatisfiable interval when placing cuts", () => {
    const grid = buildGrid(ruleset(rule("a", { employees: { kind: "between", lo: 200, hi: 50 } })));
    expect(grid.atoms.employees).toEqual([
      { kind: "range", lo: 1, hi: 500_000 },
      { kind: "missing" },
    ]);
  });
});

describe("box algebra", () => {
  const grid: Grid = buildGrid(
    ruleset(
      rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }),
      rule("b", { employees: { kind: "between", lo: 50, hi: 199 } }),
    ),
  );

  it("makes an empty box out of an unsatisfiable condition", () => {
    expect(boxIsEmpty(conditionBox({ country: { kind: "in", values: [] } }, grid))).toBe(true);
    expect(
      boxIsEmpty(conditionBox({ employees: { kind: "between", lo: 200, hi: 50 } }, grid)),
    ).toBe(true);
  });

  it("recognises containment", () => {
    const broad = conditionBox({ country: { kind: "in", values: ["FR", "DE", "UK"] } }, grid);
    const narrow = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    expect(boxContains(broad, narrow)).toBe(true);
    expect(boxContains(narrow, broad)).toBe(false);
  });

  it("returns null for a disjoint intersection", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const de = conditionBox({ country: { kind: "in", values: ["DE"] } }, grid);
    expect(intersectBoxes(fr, de)).toBeNull();
  });

  it("intersects on the conjunction of both conditions", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR", "DE"] } }, grid);
    const small = conditionBox({ employees: { kind: "between", lo: 1, hi: 49 } }, grid);
    const both = intersectBoxes(fr, small);
    expect(both).not.toBeNull();
    expect(boxAtomCount(both!)).toBe(boxAtomCount(conditionBox(
      {
        country: { kind: "in", values: ["FR", "DE"] },
        employees: { kind: "between", lo: 1, hi: 49 },
      },
      grid,
    )));
  });
});

describe("subtractBox", () => {
  const grid: Grid = buildGrid(
    ruleset(
      rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }),
      rule("b", { employees: { kind: "between", lo: 50, hi: 199 } }),
    ),
  );

  it("leaves a box alone when the subtrahend is disjoint", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const de = conditionBox({ country: { kind: "in", values: ["DE"] } }, grid);
    expect(subtractBox(fr, de)).toEqual([fr]);
  });

  it("empties a box fully covered by the subtrahend", () => {
    const narrow = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const broad = conditionBox({ country: { kind: "in", values: ["FR", "DE"] } }, grid);
    expect(subtractBox(narrow, broad)).toEqual([]);
  });

  it("conserves atoms exactly: |A| = |A ∩ B| + |A \\ B|", () => {
    // The invariant that catches every off-by-one in the decomposition. If the
    // pieces do not add up, the coverage numbers are silently wrong.
    const a = conditionBox({ country: { kind: "in", values: ["FR", "DE", "UK"] } }, grid);
    const b = conditionBox(
      {
        country: { kind: "in", values: ["FR", "DE"] },
        employees: { kind: "between", lo: 1, hi: 49 },
      },
      grid,
    );
    const overlap = intersectBoxes(a, b);
    const remainder = subtractBox(a, b);
    expect(boxAtomCount(a)).toBe(boxAtomCount(overlap!) + regionAtomCount(remainder));
  });

  it("returns pieces that are pairwise disjoint", () => {
    const a = conditionBox({}, grid);
    const b = conditionBox(
      {
        country: { kind: "in", values: ["FR"] },
        industry: { kind: "in", values: ["saas"] },
        employees: { kind: "between", lo: 1, hi: 49 },
      },
      grid,
    );
    const pieces = subtractBox(a, b);
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        expect(intersectBoxes(pieces[i]!, pieces[j]!)).toBeNull();
      }
    }
  });
});

describe("regions", () => {
  const grid: Grid = buildGrid(
    ruleset(
      rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }),
      rule("b", { employees: { kind: "between", lo: 50, hi: 199 } }),
    ),
  );

  it("subtracts a region and reports emptiness when nothing survives", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const emea = conditionBox({ country: { kind: "in", values: ["FR", "DE", "UK"] } }, grid);
    expect(regionIsEmpty(subtractRegion([fr], [emea]))).toBe(true);
    expect(regionIsEmpty(subtractRegion([emea], [fr]))).toBe(false);
  });

  it("merges boxes that differ on exactly one field", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const de = conditionBox({ country: { kind: "in", values: ["DE"] } }, grid);
    const merged = normalizeRegion([fr, de]);
    expect(merged).toHaveLength(1);
    expect(boxAtomCount(merged[0]!)).toBe(boxAtomCount(fr) + boxAtomCount(de));
  });

  it("keeps a union disjoint even when the boxes overlap", () => {
    const wide = conditionBox({ country: { kind: "in", values: ["FR", "DE"] } }, grid);
    const overlapping = conditionBox({ country: { kind: "in", values: ["DE", "UK"] } }, grid);
    const region = unionRegion([wide], overlapping);
    expect(regionAtomCount(region)).toBe(
      boxAtomCount(conditionBox({ country: { kind: "in", values: ["FR", "DE", "UK"] } }, grid)),
    );
  });

  it("intersects regions", () => {
    const emea = conditionBox({ country: { kind: "in", values: ["FR", "DE", "UK"] } }, grid);
    const small = conditionBox({ employees: { kind: "between", lo: 1, hi: 49 } }, grid);
    const both = intersectRegions([emea], [small]);
    expect(regionAtomCount(both)).toBe(
      boxAtomCount(
        conditionBox(
          {
            country: { kind: "in", values: ["FR", "DE", "UK"] },
            employees: { kind: "between", lo: 1, hi: 49 },
          },
          grid,
        ),
      ),
    );
  });

  it("covers the whole space with a rule region plus its complement", () => {
    const whole = fullBox(grid);
    const claimed = conditionBox({ country: { kind: "in", values: ["FR", "DE"] } }, grid);
    const rest = subtractRegion([whole], [claimed]);
    expect(regionAtomCount([claimed, ...rest])).toBe(boxAtomCount(whole));
  });
});

describe("leads in regions", () => {
  const grid: Grid = buildGrid(
    ruleset(rule("a", { employees: { kind: "between", lo: 1, hi: 199 } })),
  );

  it("places a lead in exactly one atom per field", () => {
    for (const field of FIELD_IDS) {
      expect(leadAtomIndex(field, lead(), grid)).toBeGreaterThanOrEqual(0);
    }
    expect(leadAtomIndex("country", lead({ country: null }), grid)).toBe(
      grid.atoms.country.length - 1,
    );
  });

  it("agrees with the condition it was built from", () => {
    const condition: Condition = {
      country: { kind: "in", values: ["FR"] },
      employees: { kind: "between", lo: 1, hi: 199 },
    };
    const region = [conditionBox(condition, grid)];
    expect(regionContainsLead(region, lead({ country: "FR", employees: 120 }), grid)).toBe(true);
    expect(regionContainsLead(region, lead({ country: "DE", employees: 120 }), grid)).toBe(false);
    expect(regionContainsLead(region, lead({ country: "FR", employees: null }), grid)).toBe(false);
  });
});

describe("prose", () => {
  const grid: Grid = buildGrid(
    ruleset(
      rule("a", { employees: { kind: "between", lo: 1, hi: 49 } }),
      rule("b", { employees: { kind: "between", lo: 50, hi: 199 } }),
    ),
  );

  it("says nothing about fields that are unconstrained", () => {
    expect(describeBox(conditionBox({ country: { kind: "in", values: ["FR"] } }, grid), grid)).toBe(
      "country ∈ {FR}",
    );
  });

  it("describes the whole space as every lead", () => {
    expect(describeBox(fullBox(grid), grid)).toBe("every lead");
  });

  it("re-joins contiguous range atoms that another rule happened to cut", () => {
    // The user wrote [1, 199]. A different rule's cut at 50 is an implementation
    // detail and must not leak into the description.
    const box = conditionBox({ employees: { kind: "between", lo: 1, hi: 199 } }, grid);
    expect(describeBox(box, grid)).toBe("employees ∈ [1, 199]");
  });

  it("names the unenriched slice as its own thing", () => {
    expect(describeBox(conditionBox({ country: { kind: "missing" } }, grid), grid)).toBe(
      "country unenriched",
    );
  });

  it("describes a region box by box", () => {
    const fr = conditionBox({ country: { kind: "in", values: ["FR"] } }, grid);
    const jp = conditionBox({ industry: { kind: "in", values: ["government"] } }, grid);
    expect(describeRegion([fr, jp], grid)).toEqual(["country ∈ {FR}", "industry ∈ {government}"]);
  });
});
