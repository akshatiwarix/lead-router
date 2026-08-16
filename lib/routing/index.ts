/**
 * The routing engine.
 *
 * Dependency-free and framework-free: it imports `zod` and nothing else. See
 * `README.md` in this directory for what that buys, and `purity.test.ts` for
 * what enforces it.
 */

export * from "./types";
export { DOMAINS, FIELD_LABELS, COUNTRIES, INDUSTRIES, SOURCES, SENIORITIES, LANGUAGES, domainOf, isNullable, valuesOf } from "./domains";
export {
  conditionSchema,
  ruleSchema,
  rulesetSchema,
  targetSchema,
  orgSchema,
  leadSchema,
  leadsSchema,
  assertRulesetTargetsResolve,
} from "./schema";
export { matchesLead, matchesValue, fieldValue, constraintAtoms } from "./condition";
export {
  buildGrid,
  conditionBox,
  fullBox,
  describeBox,
  describeRegion,
  regionContainsLead,
  regionIsEmpty,
  regionContains,
  intersectRegions,
  subtractRegion,
  unionRegion,
  leadAtomIndex,
  MAX_BOXES,
  RegionBlowupError,
} from "./grid";
export { routePure, routeWith, routeAll, routeAllPure, eligibleReps, type RoutingConfig, type PureRouting } from "./route";
export { createSelector, STRATEGY_LABELS, STRATEGY_NOTES, type Selector } from "./select";
export { analyze, findingsForRule } from "./analyze";
export { observe } from "./empirical";
export { blastRadius, withRuleDisabled } from "./diff";
export { encodeRuleset, decodeRuleset, assignmentsToCsv, type CsvContext, type DecodeResult } from "./export";
