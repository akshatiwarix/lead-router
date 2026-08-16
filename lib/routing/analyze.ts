/**
 * The eight static findings. Everything here is a statement about the whole
 * lead-space, computed exactly, and true regardless of which leads happen to
 * arrive — which is why they are labelled proofs and rendered apart from the
 * corpus observations in `empirical.ts`.
 *
 * The shape of the computation is one sweep down the ordered rule list, keeping
 * a running region of everything the rules above have already claimed. For each
 * rule: its own region, minus that running region, is the part it can actually
 * win. Empty means dead. Smaller than its own region means partly shadowed.
 * What is left over at the bottom of the list is the hole.
 *
 * Two things the module refuses to do, both of which would be easy and both of
 * which would be lies:
 *
 * It never reports a percentage of the lead-space. Atom counts are not lead
 * volume — treating them as such assumes a uniform distribution over leads,
 * which is false for every real funnel, and it is how this repo would turn back
 * into a score.
 *
 * It never reports something it merely failed to observe. `NO_ELIGIBLE_OWNER`
 * fires because no active rep *can* satisfy the target, not because none has
 * yet.
 */

import {
  conditionBox,
  describeRegion,
  fullBox,
  intersectRegions,
  regionContains,
  regionIsEmpty,
  subtractRegion,
  unionRegion,
} from "./grid";
import { eligibleReps } from "./route";
import type {
  Analysis,
  FieldId,
  Grid,
  Org,
  Region,
  Rule,
  Ruleset,
  Severity,
  StaticFinding,
  StaticFindingKind,
} from "./types";
import { FIELD_IDS } from "./types";

const SEVERITY: Readonly<Record<StaticFindingKind, Severity>> = {
  UNSATISFIABLE: "BROKEN",
  UNREACHABLE: "BROKEN",
  NO_ELIGIBLE_OWNER: "BROKEN",
  CONTESTED: "SUSPECT",
  UNCOVERED: "SUSPECT",
  PARTIALLY_SHADOWED: "NOTE",
  REDUNDANT: "NOTE",
  ENRICHMENT_DEPENDENT: "NOTE",
};

const finding = (
  kind: StaticFindingKind,
  ruleId: string | null,
  detail: string,
  relatedRuleIds: readonly string[] = [],
  region: Region | null = null,
): StaticFinding => ({
  class: "PROOF",
  kind,
  severity: SEVERITY[kind],
  ruleId,
  relatedRuleIds,
  detail,
  region,
});

/** The fields a rule actually mentions — the dimensions its author was thinking
 *  about, and the only ones worth describing a finding in terms of. */
function constrainedFields(rule: Rule): FieldId[] {
  return FIELD_IDS.filter((field) => rule.when[field] !== undefined);
}

/**
 * A readable list. Capped, because a cross-cutting rule can conflict with every
 * geographic rule below it and fifteen names is a paragraph rather than a
 * sentence — the reader stops reading, which costs more than the omission does.
 * The full set is always in `relatedRuleIds`, which is what the UI highlights.
 */
const MAX_NAMED = 4;

const list = (items: readonly string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  const shown = items.slice(0, MAX_NAMED);
  const rest = items.length - shown.length;
  const joined = `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : joined;
};

/**
 * Two rules "agree" when they would hand a lead to the same set of people. Two
 * different targets that resolve to the same reps are not a contest — they are
 * a naming difference, and reporting them would train the reader to ignore the
 * finding that matters.
 */
function sameOwners(a: Rule, b: Rule, org: Org): boolean {
  if (a.target.kind === "queue" || b.target.kind === "queue") {
    return (
      a.target.kind === "queue" &&
      b.target.kind === "queue" &&
      a.target.queueId === b.target.queueId
    );
  }
  const left = eligibleReps(a.target, org).map((rep) => rep.id).sort();
  const right = eligibleReps(b.target, org).map((rep) => rep.id).sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** A rule whose region excludes the unenriched value on some field cannot fire
 *  until enrichment lands — for the leads that arrive first, it does not exist. */
function enrichmentBlockers(rule: Rule, grid: Grid): string[] {
  const box = conditionBox(rule.when, grid);
  return FIELD_IDS.filter((field) => {
    const missingIndex = grid.atoms[field].findIndex((atom) => atom.kind === "missing");
    if (missingIndex === -1) return false; // field is always known
    if (rule.when[field] === undefined) return false; // unconstrained: admits missing
    return !box[field].has(missingIndex);
  });
}

export function analyze(ruleset: Ruleset, org: Org, grid: Grid): Analysis {
  const proofs: StaticFinding[] = [];
  const effective: Record<string, Region> = {};

  const enabled = ruleset.rules.filter((rule) => rule.enabled);

  // Own region, before anything above it is taken into account.
  const own = new Map<string, Region>();
  for (const rule of ruleset.rules) {
    const box = conditionBox(rule.when, grid);
    own.set(rule.id, regionIsEmpty([box]) ? [] : [box]);
  }

  // --- Pass 1: down the list, tracking what is already claimed -------------
  let claimed: Region = [];
  for (const rule of enabled) {
    const region = own.get(rule.id) ?? [];

    if (regionIsEmpty(region)) {
      effective[rule.id] = [];
      proofs.push(
        finding(
          "UNSATISFIABLE",
          rule.id,
          "The condition describes no lead at all — the constraints contradict each other, so this rule could not fire even if it were first in the list.",
        ),
      );
      continue;
    }

    const surviving = subtractRegion(region, claimed);
    effective[rule.id] = surviving;

    if (regionIsEmpty(surviving)) {
      const shadowers = enabled
        .slice(0, enabled.indexOf(rule))
        .filter((above) => !regionIsEmpty(intersectRegions(own.get(above.id) ?? [], region)))
        .map((above) => above.id);
      proofs.push(
        finding(
          "UNREACHABLE",
          rule.id,
          `Every lead this rule describes is already taken by ${list(shadowers.map((id) => `“${nameOf(ruleset, id)}”`))} above it. It has never fired and cannot.`,
          shadowers,
          region,
        ),
      );
    } else if (!regionIsEmpty(intersectRegions(region, claimed))) {
      // Two filters, both about whether the author would be surprised.
      //
      // A rule above that is a strict refinement of this one is the author
      // saying "this subset is special" — deliberate, and a trailing catch-all
      // is eaten by everything above it by design.
      //
      // A rule above that constrains no field this rule mentions is a guard,
      // not a conflict: "competitors never reach a rep" narrows every rule in
      // the list without any of their authors having thought about competitors.
      // Reporting it against all eighteen rules would bury the one case that
      // matters — a rule eaten along a dimension its author was actually
      // reasoning about.
      const mine = constrainedFields(rule);
      const shadowers = enabled
        .slice(0, enabled.indexOf(rule))
        .filter((above) => {
          const ownAbove = own.get(above.id) ?? [];
          if (regionIsEmpty(intersectRegions(ownAbove, region))) return false;
          if (regionContains(region, ownAbove)) return false;
          return constrainedFields(above).some((field) => mine.includes(field));
        })
        .map((above) => above.id);
      if (shadowers.length > 0) {
        proofs.push(
          finding(
            "PARTIALLY_SHADOWED",
            rule.id,
            `Part of what this rule describes is taken above it by ${list(shadowers.map((id) => `“${nameOf(ruleset, id)}”`))}. What actually reaches it: ${describeRegion(surviving, grid, mine).join("; ")}.`,
            shadowers,
            surviving,
          ),
        );
      }
    }

    // Enrichment dependence is a property of the rule's own condition and does
    // not care what is above it.
    const blockers = enrichmentBlockers(rule, grid);
    if (blockers.length > 0) {
      proofs.push(
        finding(
          "ENRICHMENT_DEPENDENT",
          rule.id,
          `Cannot fire until ${list(blockers)} ${blockers.length === 1 ? "has" : "have"} been enriched. Leads that arrive before then fall past it.`,
        ),
      );
    }

    // A rule that can win but resolves to nobody is a black hole. Note this is
    // about the target, not about the traffic: no active rep *can* satisfy it.
    if (rule.target.kind !== "queue" && eligibleReps(rule.target, org).length === 0) {
      proofs.push(
        finding(
          "NO_ELIGIBLE_OWNER",
          rule.id,
          "This rule wins leads and then resolves to nobody — no active rep satisfies its target. Every lead it takes stops here.",
          [],
          surviving,
        ),
      );
    }

    claimed = own.get(rule.id)?.reduce((acc, box) => unionRegion(acc, box), claimed) ?? claimed;
  }

  // --- Pass 2: redundancy --------------------------------------------------
  // A rule is redundant when deleting it changes no assignment: everything it
  // effectively wins would be won by a later rule that hands it to the same
  // people. This is distinct from UNREACHABLE — a redundant rule does fire.
  for (const rule of enabled) {
    const surviving = effective[rule.id];
    if (!surviving || regionIsEmpty(surviving)) continue;

    // Delete the rule and ask who catches each lead it was winning. If any of
    // them lands somewhere else — a rule with a different owner set, or the
    // catch-all — the rule was doing work and is not redundant.
    const below = enabled.slice(enabled.indexOf(rule) + 1);
    let remaining: Region = surviving;
    const agreeing: string[] = [];
    let disagrees = false;

    for (const later of below) {
      if (regionIsEmpty(remaining)) break;
      const ownLater = own.get(later.id) ?? [];
      if (regionIsEmpty(intersectRegions(remaining, ownLater))) continue;
      if (!sameOwners(rule, later, org)) {
        disagrees = true;
        break;
      }
      agreeing.push(later.id);
      remaining = subtractRegion(remaining, ownLater);
    }

    // Anything still remaining would fall to the catch-all, which is not the
    // same as what this rule does.
    if (!disagrees && regionIsEmpty(remaining) && agreeing.length > 0) {
      proofs.push(
        finding(
          "REDUNDANT",
          rule.id,
          `This rule fires, but deleting it would change nothing: ${list(agreeing.map((id) => `“${nameOf(ruleset, id)}”`))} below would send the same leads to the same people.`,
          agreeing,
          surviving,
        ),
      );
    }
  }

  // --- Pass 3: contests ----------------------------------------------------
  // Two rules that *partially* overlap and disagree about the owner. Order is
  // what resolves it, and order was decided by whoever typed last.
  //
  // The partial-overlap requirement is what separates a contest from an idiom.
  // Writing a specific rule above a general one — France above EMEA, anything
  // above a trailing catch-all — is deliberate: the author knows the general
  // rule would also match and is choosing the specific one. Reporting that
  // would fire on every well-formed ruleset and train the reader to ignore the
  // finding. A *partial* overlap is different in kind: neither rule was written
  // as a refinement of the other, both authors thought they owned the region,
  // and the tie is broken by line number. That is the merge conflict worth
  // surfacing.
  //
  // Contests are aggregated per rule rather than reported per pair. A rule that
  // cuts across the geography — "anything C-level goes to Enterprise" — conflicts
  // with every regional rule below it, and printing ten near-identical rows
  // describes ten symptoms of one decision nobody made. One row per rule, with
  // the rules it disputes and the union of the disputed region.
  for (let i = 0; i < enabled.length; i++) {
    const higher = enabled[i];
    if (!higher) continue;
    // A rule that routes to a queue is not claiming ownership — it is taking
    // the lead out of the ownership question altogether. "Competitors never
    // reach a rep" overlaps every rule below it and disagrees with all of them,
    // and none of that is a contest. A contest is two people who both think the
    // lead is theirs.
    if (higher.target.kind === "queue") continue;

    const ownHigher = own.get(higher.id) ?? [];
    const disputants: string[] = [];
    let disputed: Region = [];

    for (let j = i + 1; j < enabled.length; j++) {
      const lower = enabled[j];
      if (!lower || lower.target.kind === "queue") continue;
      const ownLower = own.get(lower.id) ?? [];
      const shared = intersectRegions(ownHigher, ownLower);
      if (regionIsEmpty(shared)) continue;
      if (sameOwners(higher, lower, org)) continue;
      if (regionContains(ownLower, ownHigher) || regionContains(ownHigher, ownLower)) continue;

      disputants.push(lower.id);
      for (const box of shared) disputed = unionRegion(disputed, box);
    }

    if (disputants.length === 0) continue;
    proofs.push(
      finding(
        "CONTESTED",
        higher.id,
        `Also matched by ${list(disputants.map((id) => `“${nameOf(ruleset, id)}”`))}, which would hand the lead to somebody else. “${higher.name}” wins only because it is higher in the list. Disputed: ${describeRegion(disputed, grid, constrainedFields(higher)).join("; ")}.`,
        disputants,
        disputed,
      ),
    );
  }

  // --- Pass 4: the hole ----------------------------------------------------
  const uncovered = subtractRegion([fullBox(grid)], claimed);
  if (!regionIsEmpty(uncovered)) {
    for (const box of uncovered) {
      proofs.push(
        finding(
          "UNCOVERED",
          null,
          `No rule claims this. Leads here fall to the catch-all: ${describeRegion([box], grid).join("; ")}.`,
          [],
          [box],
        ),
      );
    }
  }

  return { grid, proofs, uncovered, effective };
}

function nameOf(ruleset: Ruleset, ruleId: string): string {
  return ruleset.rules.find((rule) => rule.id === ruleId)?.name ?? ruleId;
}

/** Findings for one rule, in severity order. Drives the badges in the ruleset pane. */
export function findingsForRule(analysis: Analysis, ruleId: string): StaticFinding[] {
  const rank: Record<Severity, number> = { BROKEN: 0, SUSPECT: 1, NOTE: 2 };
  return analysis.proofs
    .filter((item) => item.ruleId === ruleId || item.relatedRuleIds.includes(ruleId))
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}
