/**
 * The type contract for the routing engine.
 *
 * Two ideas carry the whole repo and both are visible here.
 *
 * The first is that a rule condition is a *conjunction of at most one
 * constraint per field* over declared, finite domains — nothing else. No
 * disjunction inside a rule, no cross-field comparison, no arithmetic, no
 * regex. That makes every rule a hyperrectangle in the product of the field
 * domains, which is what lets `analyze.ts` return proofs instead of samples.
 * The language is weaker than Salesforce's on purpose.
 *
 * The second is that routing splits at a seam. Steps 1-3 of the pipeline
 * (pre-emption, matching, eligibility) are a pure function of the inputs and
 * are what the analyser reasons about. Step 4 (selection) is stateful and is
 * where the same lead can produce two different answers. `Assignment` keeps
 * both halves visible rather than collapsing them into one owner id.
 */

// ---------------------------------------------------------------------------
// Fields and domains
// ---------------------------------------------------------------------------

export const FIELD_IDS = [
  "country",
  "employees",
  "industry",
  "source",
  "seniority",
  "language",
  "existingCustomer",
  "competitor",
] as const;

export type FieldId = (typeof FIELD_IDS)[number];

/**
 * A field's universe. `nullable` means the field can arrive unenriched.
 *
 * Missing is a *value in the domain*, not a third truth value: keeping logic
 * two-valued is what keeps every set operation below exact. The cost of a
 * three-valued alternative would be the entire analysis; the benefit would be
 * something `ENRICHMENT_DEPENDENT` already says more clearly.
 */
export type Domain =
  | { readonly kind: "enum"; readonly values: readonly string[]; readonly nullable: boolean }
  | { readonly kind: "interval"; readonly lo: number; readonly hi: number; readonly nullable: boolean }
  | { readonly kind: "bool"; readonly nullable: false };

export type DomainTable = Readonly<Record<FieldId, Domain>>;

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * Note what is *not* here: no `or`, no `gt(fieldA, fieldB)`, no `matches`.
 *
 * Note also that only `missing` admits the unenriched value. `in`, `notIn`,
 * `between` and `is` all exclude it, so a rule keyed on an unenriched field
 * simply does not match — which is the real-world behaviour, and which
 * `ENRICHMENT_DEPENDENT` then reports as a property of the rule.
 */
export type Constraint =
  | { readonly kind: "in"; readonly values: readonly string[] }
  | { readonly kind: "notIn"; readonly values: readonly string[] }
  | { readonly kind: "between"; readonly lo: number; readonly hi: number }
  | { readonly kind: "is"; readonly value: boolean }
  | { readonly kind: "missing" }
  | { readonly kind: "present" };

/** An omitted field is unconstrained — the full domain, missing included. */
export type Condition = Readonly<Partial<Record<FieldId, Constraint>>>;

// ---------------------------------------------------------------------------
// Regions: the representation everything is proved over
// ---------------------------------------------------------------------------

/**
 * An atom is an indivisible slice of one field's domain, given the cut points
 * a particular ruleset happens to use. Enum and boolean fields have one atom
 * per value; a numeric field's atoms are the ranges between the endpoints
 * named anywhere in the ruleset. Every condition in that ruleset is therefore
 * exactly a union of atoms, with no remainder — which is the whole trick.
 */
export type Atom =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "range"; readonly lo: number; readonly hi: number }
  | { readonly kind: "missing" };

/** Per-field atom index sets. A box is a hyperrectangle. */
export type Box = Readonly<Record<FieldId, ReadonlySet<number>>>;

/** A union of boxes. Boxes in a region are kept disjoint by construction. */
export type Region = readonly Box[];

export type Grid = {
  readonly atoms: Readonly<Record<FieldId, readonly Atom[]>>;
};

// ---------------------------------------------------------------------------
// Rules and targets
// ---------------------------------------------------------------------------

/**
 * A target resolves to a *set* of eligible reps, never directly to a person.
 * That is what makes `NO_ELIGIBLE_OWNER` computable, and it is what keeps the
 * pure half of the pipeline from quietly absorbing the stateful half.
 */
export type Target =
  | { readonly kind: "rep"; readonly repId: string }
  | { readonly kind: "team"; readonly teamId: string }
  | { readonly kind: "queue"; readonly queueId: string }
  | {
      readonly kind: "attributes";
      readonly territory?: readonly string[];
      readonly languages?: readonly string[];
      readonly specialties?: readonly string[];
    };

export type Rule = {
  readonly id: string;
  readonly name: string;
  readonly when: Condition;
  readonly target: Target;
  readonly enabled: boolean;
};

/** Order is the decision procedure: first enabled match wins. */
export type Ruleset = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rules: readonly Rule[];
};

// ---------------------------------------------------------------------------
// The org
// ---------------------------------------------------------------------------

export type Rep = {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
  readonly territory: readonly string[];
  readonly languages: readonly string[];
  readonly specialties: readonly string[];
  /** Selection stage only. A capacity change must never move a finding. */
  readonly capacity: number;
  /** `false` means departed. Pre-emption to a departed rep is a black hole. */
  readonly active: boolean;
};

export type Team = { readonly id: string; readonly name: string };

export type Queue = {
  readonly id: string;
  readonly name: string;
  /** A queue is a terminus, not a person: no rep is ever eligible for one. */
  readonly suppresses: boolean;
};

export type Account = {
  readonly domain: string;
  readonly name: string;
  readonly ownerId: string | null;
};

export type Lead = {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly emailDomain: string;
  readonly country: string | null;
  readonly employees: number | null;
  readonly industry: string | null;
  readonly source: string;
  readonly seniority: string | null;
  readonly language: string;
  readonly existingCustomer: boolean;
  readonly competitor: boolean;
};

export type Org = {
  readonly teams: readonly Team[];
  readonly reps: readonly Rep[];
  readonly queues: readonly Queue[];
  readonly accounts: readonly Account[];
};

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export type Outcome =
  /** The account was already owned by an active rep; the rules never ran. */
  | "PREEMPTED"
  /** A rule matched and a rep was selected. */
  | "ROUTED"
  /** Routed to a suppressing queue — deliberately nobody's. */
  | "SUPPRESSED"
  /** Resolved to an empty eligible set. A departed pre-emption owner, or a
   *  target that matches no active rep. This does *not* fall through to the
   *  rules: quietly papering over it is how the black hole survives. */
  | "BLOCKED"
  /** No rule matched. The catch-all. */
  | "FALLBACK";

export type BlockedReason = "DEPARTED_ACCOUNT_OWNER" | "EMPTY_TARGET";

/**
 * The trace is the product as much as the owner is. `matchedRuleIds` is every
 * rule that matched, not just the winner — shadowing and contest are only
 * nameable because the loser list was kept.
 */
export type Assignment = {
  readonly leadId: string;
  readonly outcome: Outcome;
  /** Steps 1-3. Pure. Same inputs, same value, always. */
  readonly preemptedByAccount: string | null;
  readonly matchedRuleIds: readonly string[];
  readonly winningRuleId: string | null;
  readonly eligibleRepIds: readonly string[];
  readonly blockedReason: BlockedReason | null;
  readonly queueId: string | null;
  /** Step 4. Stateful. Under a stateful strategy this is not reproducible. */
  readonly selectedRepId: string | null;
};

export type SelectionStrategy = "FIRST_ELIGIBLE" | "ROUND_ROBIN" | "LEAST_LOADED";

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * A proof is true of the whole lead-space and was computed. An observation is
 * true of the leads in the corpus and was counted. They are rendered in
 * separate sections and are never summed into one number, because "40% of your
 * lead-space is uncovered" and "40% of your leads are uncovered" are different
 * claims and only one of them is a proof.
 */
export type FindingClass = "PROOF" | "OBSERVATION";

export type StaticFindingKind =
  | "UNSATISFIABLE"
  | "UNREACHABLE"
  | "PARTIALLY_SHADOWED"
  | "REDUNDANT"
  | "CONTESTED"
  | "UNCOVERED"
  | "ENRICHMENT_DEPENDENT"
  | "NO_ELIGIBLE_OWNER";

export type EmpiricalFindingKind =
  | "UNCOVERED_IN_PRACTICE"
  | "CONTESTED_IN_PRACTICE"
  | "PRE_EMPTED_IN_PRACTICE";

export type Severity = "BROKEN" | "SUSPECT" | "NOTE";

export type StaticFinding = {
  readonly class: "PROOF";
  readonly kind: StaticFindingKind;
  readonly severity: Severity;
  /** The rule this is about, or null for space-level findings like UNCOVERED. */
  readonly ruleId: string | null;
  /** Other rules implicated — the shadowers, or the co-claimants of a contest. */
  readonly relatedRuleIds: readonly string[];
  readonly detail: string;
  /** Present when the finding is about a region; drives the space map. */
  readonly region: Region | null;
};

export type EmpiricalFinding = {
  readonly class: "OBSERVATION";
  readonly kind: EmpiricalFindingKind;
  readonly severity: Severity;
  readonly ruleId: string | null;
  readonly relatedRuleIds: readonly string[];
  readonly detail: string;
  /** The leads actually observed. Never converted into a percentage. */
  readonly leadIds: readonly string[];
};

export type Finding = StaticFinding | EmpiricalFinding;

export type Analysis = {
  readonly grid: Grid;
  readonly proofs: readonly StaticFinding[];
  /** Region claimed by no enabled rule. Empty region means full coverage. */
  readonly uncovered: Region;
  /** Per rule, the part of its region that survives higher-priority rules. */
  readonly effective: Readonly<Record<string, Region>>;
};

// ---------------------------------------------------------------------------
// Blast radius
// ---------------------------------------------------------------------------

export type Move = {
  readonly leadId: string;
  readonly before: Assignment;
  readonly after: Assignment;
};

export type BlastRadius = {
  readonly moved: readonly Move[];
  readonly unchangedCount: number;
};
