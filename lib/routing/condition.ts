/**
 * What a single constraint means, in the two ways it needs to be meant.
 *
 * A constraint has to answer one question at runtime — *does this lead match?*
 — and a different one at analysis time — *which slices of the field's domain
 * does this cover?* Both live here, next to each other, deliberately: they are
 * two readings of one definition, and the sweep asserts they never disagree.
 * If `matchesLead` said yes where `constraintAtoms` said the region was empty,
 * every proof in the repo would be worthless, and that failure would otherwise
 * be very easy to introduce and very hard to notice.
 */

import type { Atom, Condition, Constraint, FieldId, Lead } from "./types";
import { FIELD_IDS } from "./types";

// ---------------------------------------------------------------------------
// Runtime reading: does a value satisfy a constraint?
// ---------------------------------------------------------------------------

export type FieldValue = string | number | boolean | null;

export function fieldValue(lead: Lead, field: FieldId): FieldValue {
  switch (field) {
    case "country":
      return lead.country;
    case "employees":
      return lead.employees;
    case "industry":
      return lead.industry;
    case "source":
      return lead.source;
    case "seniority":
      return lead.seniority;
    case "language":
      return lead.language;
    case "existingCustomer":
      return lead.existingCustomer;
    case "competitor":
      return lead.competitor;
  }
}

/**
 * Only `missing` admits an unenriched value. Everything else is false against
 * `null` — which is how routing actually behaves, and why a rule keyed on an
 * un-enriched field silently never fires for the leads that need it most.
 */
export function matchesValue(constraint: Constraint, value: FieldValue): boolean {
  switch (constraint.kind) {
    case "missing":
      return value === null;
    case "present":
      return value !== null;
    case "in":
      return typeof value === "string" && constraint.values.includes(value);
    case "notIn":
      return typeof value === "string" && !constraint.values.includes(value);
    case "between":
      return typeof value === "number" && value >= constraint.lo && value <= constraint.hi;
    case "is":
      return typeof value === "boolean" && value === constraint.value;
  }
}

/** Conjunction across fields; an omitted field is unconstrained. */
export function matchesLead(condition: Condition, lead: Lead): boolean {
  for (const field of FIELD_IDS) {
    const constraint = condition[field];
    if (!constraint) continue;
    if (!matchesValue(constraint, fieldValue(lead, field))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Analysis reading: which atoms does a constraint cover?
// ---------------------------------------------------------------------------

/**
 * Atoms are built (in `grid.ts`) by cutting each field's domain at every
 * boundary the ruleset mentions, so a `range` atom is always *wholly* inside or
 * *wholly* outside any `between` in that ruleset — never straddling one. That
 * property is the entire reason the answers are exact, so it is asserted here
 * rather than assumed: a straddle means the cut points were built wrong, and
 * the failure would otherwise surface as a subtly incorrect coverage claim
 * months later.
 */
export function constraintAtoms(
  field: FieldId,
  constraint: Constraint | undefined,
  atoms: readonly Atom[],
): Set<number> {
  const covered = new Set<number>();

  atoms.forEach((atom, index) => {
    if (constraint === undefined) {
      covered.add(index);
      return;
    }
    if (atom.kind === "missing") {
      if (constraint.kind === "missing") covered.add(index);
      return;
    }
    if (constraint.kind === "missing") return;
    if (constraint.kind === "present") {
      covered.add(index);
      return;
    }
    if (atom.kind === "value") {
      if (matchesValue(constraint, atom.value)) covered.add(index);
      // A boolean field's atoms carry "true"/"false" as strings; an `is`
      // constraint reads them back through the same door.
      else if (constraint.kind === "is" && atom.value === String(constraint.value)) {
        covered.add(index);
      }
      return;
    }
    // atom.kind === "range"
    if (constraint.kind !== "between") return;
    const loInside = atom.lo >= constraint.lo && atom.lo <= constraint.hi;
    const hiInside = atom.hi >= constraint.lo && atom.hi <= constraint.hi;
    if (loInside !== hiInside) {
      throw new Error(
        `atom [${atom.lo}, ${atom.hi}] straddles constraint [${constraint.lo}, ${constraint.hi}] ` +
          `on field "${field}" — the grid's cut points are incomplete`,
      );
    }
    if (loInside) covered.add(index);
  });

  return covered;
}

// ---------------------------------------------------------------------------
// Set helpers
// ---------------------------------------------------------------------------

export function intersect(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const out = new Set<number>();
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) if (large.has(value)) out.add(value);
  return out;
}

export function difference(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const out = new Set<number>();
  for (const value of a) if (!b.has(value)) out.add(value);
  return out;
}

export function union(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const out = new Set<number>(a);
  for (const value of b) out.add(value);
  return out;
}

export function isSubset(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size > b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && isSubset(a, b);
}
