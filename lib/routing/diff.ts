/**
 * Blast radius: what a pending edit actually moves.
 *
 * The question is the one nobody can answer before they hit save — *I want to
 * add a rule for the new partner motion; what breaks?* It is cheap here only
 * because steps 1-3 are pure: route the corpus under both rulesets and compare.
 *
 * Two deliberate constraints.
 *
 * The comparison runs under `FIRST_ELIGIBLE`, the one reproducible strategy. A
 * diff computed under round robin would show leads "moving" because a counter
 * advanced, which is noise dressed as a consequence, and it would be different
 * every time the user opened the panel.
 *
 * This is an attribute of an in-progress edit, not a comparison feature. There
 * is no A-versus-B view here, no saved variants, no scoring of which ruleset is
 * better — Day 012 `icp-diff` owns definition-versus-definition comparison and
 * this is not it.
 */

import { routeAll, type RoutingConfig } from "./route";
import { createSelector } from "./select";
import type { Assignment, BlastRadius, Lead, Move, Ruleset } from "./types";

/**
 * What counts as a lead having moved.
 *
 * Deliberately excluded: `winningRuleId` and `matchedRuleIds`. Those are
 * provenance, not assignment. Deleting a redundant rule changes which rule gets
 * the credit while the same lead reaches the same people for the same reason —
 * calling that a move would report an edit with no consequence as though it had
 * one, and would make every `REDUNDANT` finding contradict its own definition.
 *
 * Included: `selectedRepId`, because under `FIRST_ELIGIBLE` it is a function of
 * the eligible set, so a change there is a real consequence rather than a
 * counter having advanced.
 */
function signature(assignment: Assignment): string {
  return JSON.stringify([
    assignment.outcome,
    assignment.queueId,
    assignment.blockedReason,
    assignment.preemptedByAccount,
    assignment.eligibleRepIds,
    assignment.selectedRepId,
  ]);
}

export function blastRadius(
  leads: readonly Lead[],
  config: RoutingConfig,
  before: Ruleset,
  after: Ruleset,
): BlastRadius {
  const run = (ruleset: Ruleset) =>
    routeAll(leads, { ...config, ruleset }, createSelector("FIRST_ELIGIBLE", config.org));

  const beforeAssignments = run(before);
  const afterAssignments = run(after);

  const moved: Move[] = [];
  let unchangedCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const a = beforeAssignments[i];
    const b = afterAssignments[i];
    if (!a || !b) continue;
    if (signature(a) === signature(b)) unchangedCount += 1;
    else moved.push({ leadId: a.leadId, before: a, after: b });
  }

  return { moved, unchangedCount };
}

/**
 * Deleting a rule is the edit worth having a shorthand for, because it is what
 * every `UNREACHABLE` and `REDUNDANT` finding is implicitly proposing. The
 * sweep uses this to check the analyser against brute force: if disabling a
 * rule the analyser called dead moves even one lead, the analyser is wrong.
 */
export function withRuleDisabled(ruleset: Ruleset, ruleId: string): Ruleset {
  return {
    ...ruleset,
    rules: ruleset.rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled: false } : rule)),
  };
}
