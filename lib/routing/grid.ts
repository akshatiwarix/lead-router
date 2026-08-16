/**
 * Exact region algebra by cut-point decomposition.
 *
 * The problem this solves: *which leads does rule 14 win, given that rules 1-13
 * ran first?* Asked over an unrestricted expression language that question
 * needs an SMT solver and still comes back approximate. Asked over the language
 * in `types.ts` it is set arithmetic, and the answer is exact.
 *
 * The trick is one observation. Every condition in a ruleset names a finite
 * number of boundaries — the enum members it lists, the interval endpoints it
 * uses. Cut each field's domain at exactly those boundaries and you get a
 * modest number of *atoms* per field, with the property that no condition in
 * that ruleset can ever split one. So every condition is exactly a union of
 * atoms with no remainder, every rule is a hyperrectangle over atom indices,
 * and shadowing, coverage and contest reduce to intersection and difference.
 *
 * Two consequences worth stating out loud. The grid is built from *all* rules
 * including disabled ones, so toggling a rule cannot change the coordinate
 * system underneath the findings. And regions are kept as unions of boxes
 * rather than enumerated cells: the full cell count for eight fields runs to
 * seven figures, while the box count for a real ruleset stays in the dozens.
 */

import { constraintAtoms, difference, intersect, isSubset, setsEqual } from "./condition";
import { DOMAINS, FIELD_LABELS, valuesOf } from "./domains";
import type {
  Atom,
  Box,
  Condition,
  FieldId,
  Grid,
  Lead,
  Region,
  Rule,
  Ruleset,
} from "./types";
import { FIELD_IDS } from "./types";
import { fieldValue } from "./condition";

/**
 * Box-count ceiling. Repeated differencing can multiply boxes, and a runaway
 * would hang the browser mid-edit. Hitting this is a bug in the merge step
 * rather than a legitimate ruleset, so it throws by name instead of silently
 * truncating — a truncated region reads as "fully covered", which is the single
 * most dangerous wrong answer this module could give.
 */
export const MAX_BOXES = 20_000;

export class RegionBlowupError extends Error {
  constructor(count: number) {
    super(
      `region exceeded ${MAX_BOXES} boxes (${count}); refusing to truncate, because a truncated ` +
        `region would be reported as coverage that does not exist`,
    );
    this.name = "RegionBlowupError";
  }
}

// ---------------------------------------------------------------------------
// Building the grid
// ---------------------------------------------------------------------------

function numericAtoms(field: FieldId, rules: readonly Rule[]): Atom[] {
  const domain = DOMAINS[field];
  if (domain.kind !== "interval") throw new Error(`field "${field}" is not numeric`);

  // Cut points are half-open lower bounds: a boundary at `v` means a new atom
  // starts at `v`. An interval [lo, hi] therefore contributes `lo` and `hi + 1`.
  const cuts = new Set<number>([domain.lo, domain.hi + 1]);
  for (const rule of rules) {
    const constraint = rule.when[field];
    if (constraint?.kind !== "between") continue;
    if (constraint.lo > constraint.hi) continue; // unsatisfiable; contributes no boundary
    if (constraint.lo >= domain.lo && constraint.lo <= domain.hi) cuts.add(constraint.lo);
    if (constraint.hi >= domain.lo && constraint.hi < domain.hi) cuts.add(constraint.hi + 1);
  }

  const sorted = [...cuts].sort((a, b) => a - b);
  const atoms: Atom[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const next = sorted[i + 1];
    if (lo === undefined || next === undefined) continue;
    atoms.push({ kind: "range", lo, hi: next - 1 });
  }
  if (domain.nullable) atoms.push({ kind: "missing" });
  return atoms;
}

export function buildGrid(ruleset: Ruleset): Grid {
  const atoms = {} as Record<FieldId, readonly Atom[]>;
  for (const field of FIELD_IDS) {
    const domain = DOMAINS[field];
    if (domain.kind === "interval") {
      atoms[field] = numericAtoms(field, ruleset.rules);
    } else {
      const values: Atom[] = valuesOf(field).map((value) => ({ kind: "value", value }));
      atoms[field] = domain.nullable ? [...values, { kind: "missing" }] : values;
    }
  }
  return { atoms };
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export function fullBox(grid: Grid): Box {
  const box = {} as Record<FieldId, ReadonlySet<number>>;
  for (const field of FIELD_IDS) {
    box[field] = new Set(grid.atoms[field].map((_, index) => index));
  }
  return box;
}

export function conditionBox(condition: Condition, grid: Grid): Box {
  const box = {} as Record<FieldId, ReadonlySet<number>>;
  for (const field of FIELD_IDS) {
    box[field] = constraintAtoms(field, condition[field], grid.atoms[field]);
  }
  return box;
}

export function boxIsEmpty(box: Box): boolean {
  return FIELD_IDS.some((field) => box[field].size === 0);
}

export function intersectBoxes(a: Box, b: Box): Box | null {
  const out = {} as Record<FieldId, ReadonlySet<number>>;
  for (const field of FIELD_IDS) {
    const both = intersect(a[field], b[field]);
    if (both.size === 0) return null;
    out[field] = both;
  }
  return out;
}

export function boxContains(outer: Box, inner: Box): boolean {
  return FIELD_IDS.every((field) => isSubset(inner[field], outer[field]));
}

export function boxesEqual(a: Box, b: Box): boolean {
  return FIELD_IDS.every((field) => setsEqual(a[field], b[field]));
}

/**
 * A \ B as a set of disjoint boxes — the standard orthogonal decomposition.
 *
 * Peel one field at a time: the first slab is the part of A whose first field
 * lies outside B (with every other field left whole); the second is the part
 * that agreed with B on the first field but disagrees on the second; and so on.
 * At most one box per field, so at most eight.
 */
export function subtractBox(a: Box, b: Box): Box[] {
  const overlap = intersectBoxes(a, b);
  if (overlap === null) return [a];

  const out: Box[] = [];
  for (let i = 0; i < FIELD_IDS.length; i++) {
    const field = FIELD_IDS[i];
    if (field === undefined) continue;
    const outside = difference(a[field], b[field]);
    if (outside.size === 0) continue;

    const slab = {} as Record<FieldId, ReadonlySet<number>>;
    for (let j = 0; j < FIELD_IDS.length; j++) {
      const other = FIELD_IDS[j];
      if (other === undefined) continue;
      if (j < i) slab[other] = overlap[other];
      else if (j === i) slab[other] = outside;
      else slab[other] = a[other];
    }
    out.push(slab);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export function regionIsEmpty(region: Region): boolean {
  return region.every(boxIsEmpty);
}

/**
 * Two boxes that agree on every field but one can be replaced by a single box.
 * Without this the box count grows with every subtraction and an eighteen-rule
 * ruleset blows the ceiling; with it, real rulesets stay in the dozens.
 */
function mergeOnce(region: Region): { region: Region; merged: boolean } {
  const boxes = [...region];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b === undefined) continue;

      const differing = FIELD_IDS.filter((field) => !setsEqual(a[field], b[field]));
      if (differing.length !== 1) continue;
      const field = differing[0];
      if (field === undefined) continue;

      const combined = {} as Record<FieldId, ReadonlySet<number>>;
      for (const other of FIELD_IDS) {
        combined[other] = other === field ? new Set([...a[other], ...b[other]]) : a[other];
      }
      const rest = boxes.filter((_, index) => index !== i && index !== j);
      return { region: [combined, ...rest], merged: true };
    }
  }
  return { region: boxes, merged: false };
}

export function normalizeRegion(region: Region): Region {
  let current: Region = region.filter((box) => !boxIsEmpty(box));
  if (current.length > MAX_BOXES) throw new RegionBlowupError(current.length);

  // Bounded: every successful pass removes a box, so this cannot outlive the
  // initial box count.
  for (let guard = current.length; guard >= 0; guard--) {
    const step = mergeOnce(current);
    current = step.region;
    if (!step.merged) break;
  }
  return current;
}

export function subtractBoxFromRegion(region: Region, box: Box): Region {
  const out: Box[] = [];
  for (const existing of region) {
    for (const piece of subtractBox(existing, box)) {
      if (!boxIsEmpty(piece)) out.push(piece);
    }
    if (out.length > MAX_BOXES) throw new RegionBlowupError(out.length);
  }
  return normalizeRegion(out);
}

export function subtractRegion(region: Region, other: Region): Region {
  let current = region;
  for (const box of other) {
    if (current.length === 0) break;
    current = subtractBoxFromRegion(current, box);
  }
  return current;
}

/** Union kept disjoint: subtract what is already covered before adding. */
export function unionRegion(region: Region, box: Box): Region {
  if (boxIsEmpty(box)) return region;
  const fresh = subtractRegion([box], region);
  return normalizeRegion([...region, ...fresh]);
}

export function unionRegions(regions: readonly Region[]): Region {
  let out: Region = [];
  for (const region of regions) {
    for (const box of region) out = unionRegion(out, box);
  }
  return out;
}

export function intersectRegions(a: Region, b: Region): Region {
  const out: Box[] = [];
  for (const boxA of a) {
    for (const boxB of b) {
      const both = intersectBoxes(boxA, boxB);
      if (both !== null) out.push(both);
    }
  }
  return normalizeRegion(out);
}

// ---------------------------------------------------------------------------
// Leads inside regions
// ---------------------------------------------------------------------------

export function leadAtomIndex(field: FieldId, lead: Lead, grid: Grid): number {
  const value = fieldValue(lead, field);
  const atoms = grid.atoms[field];
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    if (atom === undefined) continue;
    if (value === null) {
      if (atom.kind === "missing") return i;
      continue;
    }
    if (atom.kind === "value" && atom.value === String(value)) return i;
    if (atom.kind === "range" && typeof value === "number" && value >= atom.lo && value <= atom.hi) {
      return i;
    }
  }
  throw new Error(
    `lead "${lead.id}" has value ${JSON.stringify(value)} on field "${field}", which no atom ` +
      `covers — the domain table is incomplete and every coverage proof is unsound`,
  );
}

export function regionContainsLead(region: Region, lead: Lead, grid: Grid): boolean {
  return region.some((box) =>
    FIELD_IDS.every((field) => box[field].has(leadAtomIndex(field, lead, grid))),
  );
}

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

function describeAtoms(field: FieldId, indices: ReadonlySet<number>, grid: Grid): string | null {
  const atoms = grid.atoms[field];
  if (indices.size === atoms.length) return null; // unconstrained: say nothing

  const chosen = [...indices].sort((a, b) => a - b).map((index) => atoms[index]);
  const label = FIELD_LABELS[field];

  const includesMissing = chosen.some((atom) => atom?.kind === "missing");
  const values = chosen.filter((atom) => atom?.kind === "value").map((atom) => atom!.value);
  const ranges = chosen.filter((atom) => atom?.kind === "range") as Extract<Atom, { kind: "range" }>[];

  const parts: string[] = [];
  if (values.length > 0) parts.push(`${label} ∈ {${values.join(", ")}}`);
  if (ranges.length > 0) {
    // Contiguous atoms read as one interval; a rule that says [1, 199] should
    // not be described as two ranges just because another rule cut at 50.
    const merged: Array<{ lo: number; hi: number }> = [];
    for (const range of [...ranges].sort((a, b) => a.lo - b.lo)) {
      const last = merged[merged.length - 1];
      if (last && range.lo === last.hi + 1) last.hi = range.hi;
      else merged.push({ lo: range.lo, hi: range.hi });
    }
    parts.push(
      `${label} ∈ ${merged.map(({ lo, hi }) => `[${lo.toLocaleString()}, ${hi.toLocaleString()}]`).join(" ∪ ")}`,
    );
  }
  if (includesMissing) parts.push(`${label} unenriched`);

  if (parts.length === 0) return `${label} ∈ ∅`;
  return parts.join(" or ");
}

export function describeBox(box: Box, grid: Grid): string {
  const parts = FIELD_IDS.map((field) => describeAtoms(field, box[field], grid)).filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? "every lead" : parts.join(", ");
}

export function describeRegion(region: Region, grid: Grid): string[] {
  return normalizeRegion(region).map((box) => describeBox(box, grid));
}
