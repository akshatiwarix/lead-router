/**
 * Steps 1-3 of the pipeline: pre-emption, matching, eligibility.
 *
 * Everything in this module is a pure function of `(lead, ruleset, org)`. That
 * is not a stylistic preference — it is the reason `analyze.ts` is allowed to
 * call its output proofs. The moment a counter, a clock or a load figure could
 * change what comes out of here, every finding downstream would be a statement
 * about one particular afternoon rather than about the ruleset.
 *
 * Selection — picking one rep out of the eligible set — lives in `select.ts`
 * precisely because it cannot make that promise.
 */

import { matchesLead } from "./condition";
import type { Selector } from "./select";
import type { Assignment, Lead, Org, Rep, Ruleset, Target } from "./types";

export type RoutingConfig = {
  readonly ruleset: Ruleset;
  readonly org: Org;
  /** Where an unmatched lead lands. Must be a non-suppressing queue. */
  readonly fallbackQueueId: string;
};

/** Steps 1-3 only. `selectedRepId` is deliberately absent: it is not knowable
 *  without state, and pretending otherwise is the mistake being refused. */
export type PureRouting = Omit<Assignment, "selectedRepId">;

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((value) => b.includes(value));
}

/**
 * A target resolves to the set of *active* reps that satisfy it.
 *
 * Departed reps are excluded here rather than filtered out later, and that is
 * what turns "a rule pointing at somebody who left" from an invisible dead end
 * into `NO_ELIGIBLE_OWNER`. Capacity is deliberately not consulted: it belongs
 * to selection, and a team being full must never change what the analyser says
 * about the ruleset.
 */
export function eligibleReps(target: Target, org: Org): Rep[] {
  const active = org.reps.filter((rep) => rep.active);

  switch (target.kind) {
    case "rep":
      return active.filter((rep) => rep.id === target.repId);
    case "team":
      return active.filter((rep) => rep.teamId === target.teamId);
    case "queue":
      // A queue is a terminus, not a person. Nobody is eligible for one.
      return [];
    case "attributes":
      return active.filter((rep) => {
        if (target.territory && !overlaps(rep.territory, target.territory)) return false;
        if (target.languages && !overlaps(rep.languages, target.languages)) return false;
        if (target.specialties && !overlaps(rep.specialties, target.specialties)) return false;
        return true;
      });
  }
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export function routePure(lead: Lead, config: RoutingConfig): PureRouting {
  const { ruleset, org, fallbackQueueId } = config;

  const base = {
    leadId: lead.id,
    preemptedByAccount: null,
    matchedRuleIds: [] as string[],
    winningRuleId: null,
    eligibleRepIds: [] as string[],
    blockedReason: null,
    queueId: null,
  } satisfies Omit<PureRouting, "outcome">;

  // 1. Pre-emption. An account that already has an owner beats every rule in
  //    the list — this is the one piece of routing that every org agrees on,
  //    and it is why a territory rule can be perfectly reachable on paper and
  //    never fire in practice.
  const account = org.accounts.find((candidate) => candidate.domain === lead.emailDomain);
  if (account && account.ownerId !== null) {
    const owner = org.reps.find((rep) => rep.id === account.ownerId);
    if (owner && owner.active) {
      return {
        ...base,
        outcome: "PREEMPTED",
        preemptedByAccount: account.domain,
        eligibleRepIds: [owner.id],
      };
    }
    // The owner left and nobody reassigned the account. This does not fall
    // through to the rules: falling through is how the black hole survives for
    // two years without anyone learning it exists.
    return {
      ...base,
      outcome: "BLOCKED",
      preemptedByAccount: account.domain,
      blockedReason: "DEPARTED_ACCOUNT_OWNER",
    };
  }

  // 2. Matching. Every enabled rule is evaluated even though only the first
  //    match decides, because shadowing and contest are only nameable if the
  //    losers were kept.
  const matched = ruleset.rules.filter((rule) => rule.enabled && matchesLead(rule.when, lead));
  const matchedRuleIds = matched.map((rule) => rule.id);
  const winner = matched[0];

  if (!winner) {
    return { ...base, outcome: "FALLBACK", matchedRuleIds, queueId: fallbackQueueId };
  }

  // 3. Eligibility.
  const { target } = winner;
  if (target.kind === "queue") {
    const queue = org.queues.find((candidate) => candidate.id === target.queueId);
    return {
      ...base,
      // A suppressing queue is a decision — deliberately nobody's. A
      // non-suppressing one is the catch-all, which is the same place an
      // unmatched lead lands; `winningRuleId` is what tells them apart.
      outcome: queue?.suppresses ? "SUPPRESSED" : "FALLBACK",
      matchedRuleIds,
      winningRuleId: winner.id,
      queueId: queue?.id ?? fallbackQueueId,
    };
  }

  const eligible = eligibleReps(target, org);
  if (eligible.length === 0) {
    return {
      ...base,
      outcome: "BLOCKED",
      matchedRuleIds,
      winningRuleId: winner.id,
      blockedReason: "EMPTY_TARGET",
    };
  }

  return {
    ...base,
    outcome: "ROUTED",
    matchedRuleIds,
    winningRuleId: winner.id,
    eligibleRepIds: eligible.map((rep) => rep.id),
  };
}

// ---------------------------------------------------------------------------
// Joining the two halves
// ---------------------------------------------------------------------------

/**
 * The pure result plus one selected rep. The selector is passed in rather than
 * constructed here so the impurity is visible at the call site: a reader can
 * see exactly where the function stops being a function.
 *
 * Note what selection cannot do. It never changes the outcome, never changes
 * the eligible set, never changes which rule won. It fills in one field.
 */
export function routeWith(lead: Lead, config: RoutingConfig, selector: Selector): Assignment {
  const pure = routePure(lead, config);
  const selectedRepId =
    pure.outcome === "PREEMPTED"
      ? (pure.eligibleRepIds[0] ?? null)
      : pure.outcome === "ROUTED"
        ? selector.select(pure.eligibleRepIds)
        : null;
  return { ...pure, selectedRepId };
}

export function routeAll(
  leads: readonly Lead[],
  config: RoutingConfig,
  selector: Selector,
): Assignment[] {
  return leads.map((lead) => routeWith(lead, config, selector));
}

/** Steps 1-3 across the corpus. This is what every proof is a proof about. */
export function routeAllPure(leads: readonly Lead[], config: RoutingConfig): PureRouting[] {
  return leads.map((lead) => routePure(lead, config));
}
