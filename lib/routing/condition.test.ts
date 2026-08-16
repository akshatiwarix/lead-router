import { describe, expect, it } from "vitest";
import {
  constraintAtoms,
  difference,
  intersect,
  isSubset,
  matchesLead,
  matchesValue,
  setsEqual,
  union,
} from "./condition";
import type { Atom, Lead } from "./types";

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

describe("matchesValue", () => {
  it("treats missing as a value only `missing` admits", () => {
    expect(matchesValue({ kind: "missing" }, null)).toBe(true);
    expect(matchesValue({ kind: "present" }, null)).toBe(false);
    expect(matchesValue({ kind: "in", values: ["FR"] }, null)).toBe(false);
    expect(matchesValue({ kind: "notIn", values: ["FR"] }, null)).toBe(false);
    expect(matchesValue({ kind: "between", lo: 1, hi: 10 }, null)).toBe(false);
  });

  it("does not let `notIn` leak into the unenriched case", () => {
    // The tempting bug: reading `notIn` as "anything that is not FR", which
    // sweeps up every lead whose country has not been resolved yet. Those leads
    // are exactly the ones a routing mistake is most expensive on.
    expect(matchesValue({ kind: "notIn", values: ["FR"] }, "DE")).toBe(true);
    expect(matchesValue({ kind: "notIn", values: ["FR"] }, null)).toBe(false);
  });

  it("reads intervals inclusively at both ends", () => {
    expect(matchesValue({ kind: "between", lo: 50, hi: 199 }, 50)).toBe(true);
    expect(matchesValue({ kind: "between", lo: 50, hi: 199 }, 199)).toBe(true);
    expect(matchesValue({ kind: "between", lo: 50, hi: 199 }, 49)).toBe(false);
    expect(matchesValue({ kind: "between", lo: 50, hi: 199 }, 200)).toBe(false);
  });

  it("is empty when `lo > hi`, rather than throwing", () => {
    // An unsatisfiable rule is a thing real rulesets contain. It has to survive
    // long enough to be reported.
    expect(matchesValue({ kind: "between", lo: 200, hi: 50 }, 100)).toBe(false);
  });
});

describe("matchesLead", () => {
  it("is a conjunction, with omitted fields unconstrained", () => {
    expect(matchesLead({ country: { kind: "in", values: ["FR", "DE"] } }, lead())).toBe(true);
    expect(
      matchesLead(
        {
          country: { kind: "in", values: ["FR"] },
          employees: { kind: "between", lo: 100, hi: 500 },
        },
        lead(),
      ),
    ).toBe(true);
    expect(
      matchesLead(
        {
          country: { kind: "in", values: ["FR"] },
          employees: { kind: "between", lo: 500, hi: 1000 },
        },
        lead(),
      ),
    ).toBe(false);
  });

  it("matches everything when the condition is empty", () => {
    expect(matchesLead({}, lead())).toBe(true);
    expect(matchesLead({}, lead({ country: null, employees: null, industry: null }))).toBe(true);
  });

  it("fails a rule keyed on a field the lead has not had enriched", () => {
    const condition = { employees: { kind: "between", lo: 1, hi: 49 } } as const;
    expect(matchesLead(condition, lead({ employees: 20 }))).toBe(true);
    expect(matchesLead(condition, lead({ employees: null }))).toBe(false);
  });
});

describe("constraintAtoms", () => {
  const enumAtoms: Atom[] = [
    { kind: "value", value: "FR" },
    { kind: "value", value: "DE" },
    { kind: "value", value: "US" },
    { kind: "missing" },
  ];

  it("covers every atom when the field is unconstrained", () => {
    expect(constraintAtoms("country", undefined, enumAtoms)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("excludes the missing atom for every constraint except `missing`", () => {
    expect(constraintAtoms("country", { kind: "in", values: ["FR"] }, enumAtoms)).toEqual(
      new Set([0]),
    );
    expect(constraintAtoms("country", { kind: "notIn", values: ["FR"] }, enumAtoms)).toEqual(
      new Set([1, 2]),
    );
    expect(constraintAtoms("country", { kind: "present" }, enumAtoms)).toEqual(new Set([0, 1, 2]));
    expect(constraintAtoms("country", { kind: "missing" }, enumAtoms)).toEqual(new Set([3]));
  });

  it("reads boolean atoms through their string form", () => {
    const boolAtoms: Atom[] = [
      { kind: "value", value: "false" },
      { kind: "value", value: "true" },
    ];
    expect(constraintAtoms("competitor", { kind: "is", value: true }, boolAtoms)).toEqual(
      new Set([1]),
    );
    expect(constraintAtoms("competitor", { kind: "is", value: false }, boolAtoms)).toEqual(
      new Set([0]),
    );
  });

  it("takes whole range atoms and never half of one", () => {
    const rangeAtoms: Atom[] = [
      { kind: "range", lo: 1, hi: 49 },
      { kind: "range", lo: 50, hi: 199 },
      { kind: "range", lo: 200, hi: 500_000 },
      { kind: "missing" },
    ];
    expect(constraintAtoms("employees", { kind: "between", lo: 1, hi: 199 }, rangeAtoms)).toEqual(
      new Set([0, 1]),
    );
    expect(constraintAtoms("employees", { kind: "between", lo: 200, hi: 500_000 }, rangeAtoms)).toEqual(
      new Set([2]),
    );
  });

  it("refuses to guess when an atom straddles a constraint boundary", () => {
    // This can only happen if the grid was built without a cut point the rule
    // needs. Silently rounding either way would produce a coverage claim that
    // is wrong in a direction nobody can see.
    const badAtoms: Atom[] = [{ kind: "range", lo: 1, hi: 500_000 }];
    expect(() => constraintAtoms("employees", { kind: "between", lo: 1, hi: 49 }, badAtoms)).toThrow(
      /straddles/,
    );
  });
});

describe("set helpers", () => {
  it("intersects, differences and unions", () => {
    const a = new Set([1, 2, 3]);
    const b = new Set([2, 3, 4]);
    expect(intersect(a, b)).toEqual(new Set([2, 3]));
    expect(difference(a, b)).toEqual(new Set([1]));
    expect(union(a, b)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("intersects the same way regardless of argument order", () => {
    const a = new Set([1, 2, 3, 4, 5]);
    const b = new Set([4, 5]);
    expect(intersect(a, b)).toEqual(intersect(b, a));
  });

  it("reads subset and equality", () => {
    expect(isSubset(new Set([1, 2]), new Set([1, 2, 3]))).toBe(true);
    expect(isSubset(new Set([1, 4]), new Set([1, 2, 3]))).toBe(false);
    expect(isSubset(new Set(), new Set([1]))).toBe(true);
    expect(setsEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(setsEqual(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false);
  });
});
