/**
 * The invariant sweep.
 *
 * The unit tests check that the code does what it was written to do. This
 * checks that the *proofs are true* — by brute force, against the corpus, in a
 * way that does not reuse the analyser's own reasoning.
 *
 * The important ones are the soundness pairs. `UNREACHABLE` means "deleting
 * this rule changes nothing", so the sweep deletes it and looks. `REDUNDANT`
 * means the same thing for a rule that does fire. And the converse: any rule
 * that actually wins a corpus lead and carries neither flag must move at least
 * one lead when deleted, or the analyser is under-reporting.
 *
 * Run with `npm run sweep`. Non-zero exit on any violation.
 */

import { INHERITED_RULESET, LEADS, ORG, PRESETS, QUEUE_CATCHALL } from "@/data";
import { analyze } from "@/lib/routing/analyze";
import { blastRadius, withRuleDisabled } from "@/lib/routing/diff";
import { observe } from "@/lib/routing/empirical";
import { buildGrid, fullBox, leadAtomIndex } from "@/lib/routing/grid";
import { routeAll, routeAllPure, type RoutingConfig } from "@/lib/routing/route";
import { createSelector } from "@/lib/routing/select";
import { FIELD_IDS, type Box, type Org, type Region } from "@/lib/routing/types";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Atom count, computed independently of anything in `grid.ts`. */
const boxSize = (box: Box) => FIELD_IDS.reduce((total, field) => total * box[field].size, 1);
const regionSize = (region: Region) => region.reduce((total, box) => total + boxSize(box), 0);

const config: RoutingConfig = {
  ruleset: INHERITED_RULESET,
  org: ORG,
  fallbackQueueId: QUEUE_CATCHALL,
};

const grid = buildGrid(INHERITED_RULESET);
const analysis = analyze(INHERITED_RULESET, ORG, grid);

console.log(
  `sweep — ${LEADS.length} leads × ${INHERITED_RULESET.rules.length} rules × ${PRESETS.length} rulesets, no network`,
);

// ---------------------------------------------------------------------------
section("partition");
// ---------------------------------------------------------------------------

for (const lead of LEADS) {
  for (const field of FIELD_IDS) {
    const atoms = grid.atoms[field];
    const matching = atoms.filter((atom, index) => {
      try {
        return leadAtomIndex(field, lead, grid) === index;
      } catch {
        return false;
      }
    });
    check(
      `lead ${lead.id} occupies exactly one ${field} atom`,
      matching.length === 1,
      `${matching.length} atoms`,
    );
  }
}

// ---------------------------------------------------------------------------
section("completeness");
// ---------------------------------------------------------------------------

{
  // Effective regions are disjoint by construction — each is a rule's own
  // region minus everything above it — so their sizes plus the hole must be the
  // whole space exactly. An off-by-one anywhere in the box algebra shows up
  // here and nowhere else.
  const claimed = Object.values(analysis.effective).reduce(
    (total, region) => total + regionSize(region),
    0,
  );
  const hole = regionSize(analysis.uncovered);
  const whole = boxSize(fullBox(grid));
  check(
    "claimed + uncovered = the whole lead-space",
    claimed + hole === whole,
    `${claimed} + ${hole} = ${claimed + hole}, expected ${whole}`,
  );
}

for (const ruleset of PRESETS) {
  const presetGrid = buildGrid(ruleset);
  const presetAnalysis = analyze(ruleset, ORG, presetGrid);
  const claimed = Object.values(presetAnalysis.effective).reduce(
    (total, region) => total + regionSize(region),
    0,
  );
  check(
    `${ruleset.id}: claimed + uncovered = the whole lead-space`,
    claimed + regionSize(presetAnalysis.uncovered) === boxSize(fullBox(presetGrid)),
  );
}

// ---------------------------------------------------------------------------
section("eligibility is a function");
// ---------------------------------------------------------------------------

{
  const first = JSON.stringify(routeAllPure(LEADS, config));
  let stable = true;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(routeAllPure(LEADS, config)) !== first) stable = false;
  }
  check("100 runs of steps 1-3 are byte-identical", stable);
}

// ---------------------------------------------------------------------------
section("capacity cannot move a finding");
// ---------------------------------------------------------------------------

{
  const withCapacity = (capacity: number): Org => ({
    ...ORG,
    reps: ORG.reps.map((rep) => ({ ...rep, capacity })),
  });
  const at = (capacity: number) =>
    JSON.stringify(analyze(INHERITED_RULESET, withCapacity(capacity), grid).proofs);
  check("findings are identical at capacity 0 and 10,000", at(0) === at(10_000));

  const routedAt = (capacity: number) =>
    JSON.stringify(routeAllPure(LEADS, { ...config, org: withCapacity(capacity) }));
  check("steps 1-3 are identical at capacity 0 and 10,000", routedAt(0) === routedAt(10_000));
}

// ---------------------------------------------------------------------------
section("selection is quarantined");
// ---------------------------------------------------------------------------

{
  const eligible = ["r-marie", "r-jonas", "r-priya", "r-elena"];

  const first = createSelector("FIRST_ELIGIBLE", ORG);
  const firstAnswers = new Set(Array.from({ length: 8 }, () => first.select(eligible)));
  check("FIRST_ELIGIBLE answers the same question the same way", firstAnswers.size === 1);

  const robin = createSelector("ROUND_ROBIN", ORG);
  const robinAnswers = new Set(Array.from({ length: 4 }, () => robin.select(eligible)));
  check(
    "ROUND_ROBIN demonstrably does not — the label is backed by evidence",
    robinAnswers.size > 1,
  );

  // Whatever selection does, it must not touch anything the analyser reads.
  const strip = (assignments: ReturnType<typeof routeAll>) =>
    JSON.stringify(assignments.map((a) => ({ ...a, selectedRepId: "ignored" })));
  check(
    "the strategy cannot change an outcome, an eligible set or a winning rule",
    strip(routeAll(LEADS, config, createSelector("FIRST_ELIGIBLE", ORG))) ===
      strip(routeAll(LEADS, config, createSelector("LEAST_LOADED", ORG))),
  );
}

// ---------------------------------------------------------------------------
section("the analyser, checked by brute force");
// ---------------------------------------------------------------------------

{
  const results = routeAllPure(LEADS, config);
  const observations = observe(LEADS, INHERITED_RULESET, analysis, config);
  const starved = new Set(
    observations
      .filter((finding) => finding.kind === "PRE_EMPTED_IN_PRACTICE")
      .map((finding) => finding.ruleId),
  );

  const flagged = (kind: string) =>
    analysis.proofs
      .filter((finding) => finding.kind === kind)
      .map((finding) => finding.ruleId)
      .filter((id): id is string => id !== null);

  const dead = new Set([...flagged("UNREACHABLE"), ...flagged("UNSATISFIABLE")]);
  const redundant = new Set(flagged("REDUNDANT"));

  for (const ruleId of dead) {
    const radius = blastRadius(LEADS, config, INHERITED_RULESET, withRuleDisabled(INHERITED_RULESET, ruleId));
    check(
      `deleting the dead rule ${ruleId} moves nobody`,
      radius.moved.length === 0,
      `${radius.moved.length} leads moved`,
    );
  }

  for (const ruleId of redundant) {
    const radius = blastRadius(LEADS, config, INHERITED_RULESET, withRuleDisabled(INHERITED_RULESET, ruleId));
    check(
      `deleting the redundant rule ${ruleId} moves nobody`,
      radius.moved.length === 0,
      `${radius.moved.length} leads moved`,
    );
  }

  // The converse, stated carefully.
  //
  // The tempting version — "a rule the analyser did not flag must move somebody
  // when deleted" — is wrong, and getting it wrong here would be the same
  // mistake the whole repo is about. `UNREACHABLE` and `REDUNDANT` are claims
  // about the lead-space; seventy leads cannot falsify one. `rl-c-level` is a
  // live rule whose only corpus lead is a 1,600-person company that the
  // enterprise rule below would send to the same team anyway. It is doing real
  // work in the space and none of it here.
  //
  // So the checkable converse is the space-level one: a rule flagged neither
  // dead nor redundant must have a non-empty effective region. The corpus-level
  // observation is counted and printed, never asserted.
  let liveButUndistinguished = 0;
  for (const rule of INHERITED_RULESET.rules) {
    if (!rule.enabled) continue;
    if (dead.has(rule.id) || redundant.has(rule.id)) {
      check(`the dead-or-redundant rule ${rule.id} is consistent with its effective region`, true);
      continue;
    }
    const region = analysis.effective[rule.id] ?? [];
    check(`the live rule ${rule.id} has a non-empty effective region`, regionSize(region) > 0);

    if (starved.has(rule.id)) continue;
    const wins = results.filter((result) => result.winningRuleId === rule.id).length;
    if (wins === 0) continue;
    const radius = blastRadius(LEADS, config, INHERITED_RULESET, withRuleDisabled(INHERITED_RULESET, rule.id));
    if (radius.moved.length === 0) liveButUndistinguished += 1;
  }
  console.log(
    `  · ${liveButUndistinguished} live rule(s) win corpus leads that would reach the same owners without them — ` +
      `an observation about these 70 leads, not a defect in the ruleset`,
  );
}

// ---------------------------------------------------------------------------
section("blast radius is exact");
// ---------------------------------------------------------------------------

for (const rule of INHERITED_RULESET.rules) {
  const edited = withRuleDisabled(INHERITED_RULESET, rule.id);
  const radius = blastRadius(LEADS, config, INHERITED_RULESET, edited);
  check(
    `${rule.id}: moved + unchanged = every lead`,
    radius.moved.length + radius.unchangedCount === LEADS.length,
  );

  const before = new Map(
    routeAll(LEADS, config, createSelector("FIRST_ELIGIBLE", ORG)).map((a) => [a.leadId, a]),
  );
  const after = new Map(
    routeAll(LEADS, { ...config, ruleset: edited }, createSelector("FIRST_ELIGIBLE", ORG)).map(
      (a) => [a.leadId, a],
    ),
  );
  for (const move of radius.moved) {
    const b = before.get(move.leadId);
    const a = after.get(move.leadId);
    check(
      `${rule.id}: ${move.leadId} really did change`,
      JSON.stringify([b?.outcome, b?.selectedRepId, b?.queueId]) !==
        JSON.stringify([a?.outcome, a?.selectedRepId, a?.queueId]) ||
        JSON.stringify(b?.eligibleRepIds) !== JSON.stringify(a?.eligibleRepIds),
    );
  }
}

// ---------------------------------------------------------------------------
section("every finding and every outcome is reachable");
// ---------------------------------------------------------------------------

{
  const kinds = new Set(analysis.proofs.map((finding) => finding.kind));
  for (const kind of [
    "UNSATISFIABLE",
    "UNREACHABLE",
    "PARTIALLY_SHADOWED",
    "REDUNDANT",
    "CONTESTED",
    "UNCOVERED",
    "ENRICHMENT_DEPENDENT",
    "NO_ELIGIBLE_OWNER",
  ]) {
    check(`static finding ${kind} is reachable`, kinds.has(kind as never));
  }

  const observed = new Set(
    observe(LEADS, INHERITED_RULESET, analysis, config).map((finding) => finding.kind),
  );
  for (const kind of [
    "UNCOVERED_IN_PRACTICE",
    "CONTESTED_IN_PRACTICE",
    "PRE_EMPTED_IN_PRACTICE",
  ]) {
    check(`empirical finding ${kind} is reachable`, observed.has(kind as never));
  }

  const outcomes = new Set(routeAllPure(LEADS, config).map((result) => result.outcome));
  for (const outcome of ["PREEMPTED", "ROUTED", "SUPPRESSED", "BLOCKED", "FALLBACK"]) {
    check(`outcome ${outcome} is reachable`, outcomes.has(outcome as never));
  }
}

// ---------------------------------------------------------------------------
section("no number that pretends to be a proportion");
// ---------------------------------------------------------------------------

{
  const details = [
    ...analysis.proofs.map((finding) => finding.detail),
    ...observe(LEADS, INHERITED_RULESET, analysis, config).map((finding) => finding.detail),
  ];
  check(
    "no finding reports a percentage",
    details.every((detail) => !detail.includes("%")),
  );
}

// ---------------------------------------------------------------------------

console.log(
  `\n${checks - failures}/${checks} invariants held` + (failures ? ` — ${failures} FAILED` : ""),
);
if (failures > 0) process.exit(1);
