/**
 * Step 4. The only stateful module in the engine, and the only place the same
 * lead can produce two different answers.
 *
 * Every routing tool presents assignment as though it were a function of the
 * lead — *this lead went to Dana* — while a counter somewhere off screen is
 * doing the actual choosing. Run the same lead through again and you get Priya.
 * That is not a bug in those tools; it is what fair distribution means. The bug
 * is not saying so.
 *
 * So the seam is drawn here rather than papered over. A selector declares
 * whether it is `reproducible`, the UI renders that declaration, and
 * `select.test.ts` asserts it by actually re-running the same input — the label
 * is backed by evidence rather than by a comment.
 *
 * Capacity lives on this side too, and it is deliberately soft: when every
 * eligible rep is at their cap the lead still goes to one of them rather than
 * becoming `BLOCKED`. Letting capacity produce an outcome would let a load
 * figure change what the analyser proves, and decision 19 says it cannot.
 */

import type { Org, Rep, SelectionStrategy } from "./types";

export type Selector = {
  readonly strategy: SelectionStrategy;
  /** Whether the same eligible set, asked twice, yields the same rep. */
  readonly reproducible: boolean;
  select(eligibleRepIds: readonly string[]): string | null;
};

export const STRATEGY_LABELS: Readonly<Record<SelectionStrategy, string>> = {
  FIRST_ELIGIBLE: "First eligible",
  ROUND_ROBIN: "Round robin",
  LEAST_LOADED: "Least loaded",
};

export const STRATEGY_NOTES: Readonly<Record<SelectionStrategy, string>> = {
  FIRST_ELIGIBLE:
    "Deterministic. The same lead and the same ruleset always produce the same rep.",
  ROUND_ROBIN:
    "Not reproducible. A counter decides, so re-running the same lead produces a different rep.",
  LEAST_LOADED:
    "Not reproducible. Assignment depends on who is carrying what right now, not on the lead.",
};

export function createSelector(strategy: SelectionStrategy, org: Org): Selector {
  const order = new Map(org.reps.map((rep, index) => [rep.id, index]));
  const capacity = new Map(org.reps.map((rep: Rep) => [rep.id, rep.capacity]));
  const assigned = new Map<string, number>();
  let cursor = 0;

  const load = (repId: string) => assigned.get(repId) ?? 0;
  const byDeclaration = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  /** Under cap if possible; everyone if not. Capacity shapes the choice but
   *  never removes the outcome. */
  const withRoom = (ids: readonly string[]) => {
    const room = ids.filter((id) => load(id) < (capacity.get(id) ?? 0));
    return room.length > 0 ? room : [...ids];
  };

  const take = (repId: string) => {
    assigned.set(repId, load(repId) + 1);
    return repId;
  };

  return {
    strategy,
    reproducible: strategy === "FIRST_ELIGIBLE",
    select(eligibleRepIds) {
      if (eligibleRepIds.length === 0) return null;
      const candidates = withRoom(eligibleRepIds).sort(byDeclaration);
      const first = candidates[0];
      if (first === undefined) return null;

      switch (strategy) {
        case "FIRST_ELIGIBLE":
          // No counter is read, so this does not advance and does not care what
          // came before it.
          return first;
        case "ROUND_ROBIN": {
          const picked = candidates[cursor % candidates.length] ?? first;
          cursor += 1;
          return take(picked);
        }
        case "LEAST_LOADED": {
          const picked = candidates.reduce((best, id) =>
            load(id) < load(best) ? id : best,
          );
          return take(picked);
        }
      }
    },
  };
}
