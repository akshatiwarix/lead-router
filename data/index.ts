/**
 * The corpus, validated once at import.
 *
 * Zod catches malformed records; `assertRulesetTargetsResolve` catches the
 * cross-file mistakes a per-file schema cannot see — a rule pointing at a team
 * that was renamed, a queue id that was never created. Both run at module load,
 * so a broken corpus fails the build rather than rendering an empty console.
 */

import { assertRulesetTargetsResolve } from "@/lib/routing/schema";
import { ORG } from "./org";
import { PRESETS } from "./rulesets";

for (const ruleset of PRESETS) {
  assertRulesetTargetsResolve(ruleset, ORG);
}

export { ORG, TEAMS, REPS_BY_ID, TEAMS_BY_ID, QUEUES_BY_ID, ACCOUNTS_BY_DOMAIN, QUEUE_CATCHALL, QUEUE_DO_NOT_ROUTE } from "./org";
export { INHERITED_RULESET, PRESETS } from "./rulesets";
export { LEADS } from "./leads";
