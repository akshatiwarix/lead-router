/**
 * The trust boundary. Everything that enters the engine — the corpus at import,
 * a permalink off the URL bar, a rule the model wrote — is parsed here first.
 *
 * The division of labour matters. This module rejects things that are *not
 * well-formed*: a country the domain table has never heard of, a `missing`
 * constraint on a field that can never be missing, a rule pointing at a team
 * that does not exist. It deliberately does *not* reject things that are merely
 * *wrong*: an empty `in` list and a `between` with `lo > hi` both parse, because
 * an unsatisfiable rule is a real thing that real rulesets contain, and
 * reporting it is `analyze.ts`'s job. A validator that rejected them would be
 * hiding the exact defect the product exists to surface.
 */

import { z } from "zod";
import {
  COUNTRIES,
  DOMAINS,
  EMPLOYEES_MAX,
  EMPLOYEES_MIN,
  INDUSTRIES,
  LANGUAGES,
  SENIORITIES,
  SOURCES,
} from "./domains";
import { FIELD_IDS, type FieldId, type Org, type Ruleset } from "./types";

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

const constraintSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("in"), values: z.array(z.string()) }),
  z.object({ kind: z.literal("notIn"), values: z.array(z.string()) }),
  z.object({ kind: z.literal("between"), lo: z.number().int(), hi: z.number().int() }),
  z.object({ kind: z.literal("is"), value: z.boolean() }),
  z.object({ kind: z.literal("missing") }),
  z.object({ kind: z.literal("present") }),
]);

type ParsedConstraint = z.infer<typeof constraintSchema>;

/**
 * A constraint has to fit the shape of the field it is written against. This is
 * where a `between` on `country` or an `in` on `employees` dies — not with a
 * type error at some call site three modules later, but at the door.
 */
function constraintFitsField(field: FieldId, constraint: ParsedConstraint): string | null {
  const domain = DOMAINS[field];

  if (constraint.kind === "missing" && !domain.nullable) {
    return `field "${field}" is never missing, so a \`missing\` constraint on it is meaningless`;
  }
  if (constraint.kind === "missing" || constraint.kind === "present") return null;

  switch (domain.kind) {
    case "enum": {
      if (constraint.kind !== "in" && constraint.kind !== "notIn") {
        return `field "${field}" is an enum; use \`in\` or \`notIn\`, not \`${constraint.kind}\``;
      }
      const unknown = constraint.values.filter((v) => !domain.values.includes(v));
      if (unknown.length > 0) {
        return `field "${field}" has no value(s) ${unknown.map((v) => `"${v}"`).join(", ")}`;
      }
      return null;
    }
    case "interval": {
      if (constraint.kind !== "between") {
        return `field "${field}" is numeric; use \`between\`, not \`${constraint.kind}\``;
      }
      // `lo > hi` is allowed through on purpose — see the module comment.
      if (constraint.lo < domain.lo || constraint.hi > domain.hi) {
        return `field "${field}" is bounded to [${domain.lo}, ${domain.hi}]`;
      }
      return null;
    }
    case "bool": {
      if (constraint.kind !== "is") {
        return `field "${field}" is boolean; use \`is\`, not \`${constraint.kind}\``;
      }
      return null;
    }
  }
}

const conditionShape = Object.fromEntries(
  FIELD_IDS.map((field) => [field, constraintSchema.optional()]),
) as Record<FieldId, z.ZodOptional<typeof constraintSchema>>;

export const conditionSchema = z.object(conditionShape).superRefine((condition, ctx) => {
  for (const field of FIELD_IDS) {
    const constraint = condition[field];
    if (!constraint) continue;
    const problem = constraintFitsField(field, constraint);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: [field] });
  }
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rep"), repId: z.string().min(1) }),
  z.object({ kind: z.literal("team"), teamId: z.string().min(1) }),
  z.object({ kind: z.literal("queue"), queueId: z.string().min(1) }),
  z.object({
    kind: z.literal("attributes"),
    territory: z.array(z.enum(COUNTRIES)).optional(),
    languages: z.array(z.enum(LANGUAGES)).optional(),
    specialties: z.array(z.enum(INDUSTRIES)).optional(),
  }),
]);

export const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  when: conditionSchema,
  target: targetSchema,
  enabled: z.boolean(),
});

export const rulesetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    rules: z.array(ruleSchema),
  })
  .superRefine((ruleset, ctx) => {
    const seen = new Set<string>();
    for (const rule of ruleset.rules) {
      if (seen.has(rule.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate rule id "${rule.id}"` });
      }
      seen.add(rule.id);
    }
  });

// ---------------------------------------------------------------------------
// The org
// ---------------------------------------------------------------------------

export const teamSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

export const repSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  territory: z.array(z.enum(COUNTRIES)),
  languages: z.array(z.enum(LANGUAGES)),
  specialties: z.array(z.enum(INDUSTRIES)),
  capacity: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const queueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  suppresses: z.boolean(),
});

/** `.example` is not decoration. The corpus is authored and describes no real
 *  company, and a validator is a cheaper guarantee than a review habit. */
const exampleDomain = z
  .string()
  .min(3)
  .refine((d) => d.endsWith(".example"), {
    message: "the corpus is synthetic — every domain must end in `.example`",
  });

export const accountSchema = z.object({
  domain: exampleDomain,
  name: z.string().min(1),
  ownerId: z.string().min(1).nullable(),
});

export const orgSchema = z
  .object({
    teams: z.array(teamSchema),
    reps: z.array(repSchema),
    queues: z.array(queueSchema),
    accounts: z.array(accountSchema),
  })
  .superRefine((org, ctx) => {
    const teamIds = new Set(org.teams.map((t) => t.id));
    const repIds = new Set(org.reps.map((r) => r.id));
    for (const rep of org.reps) {
      if (!teamIds.has(rep.teamId)) {
        ctx.addIssue({ code: "custom", message: `rep "${rep.id}" is on unknown team "${rep.teamId}"` });
      }
    }
    for (const account of org.accounts) {
      if (account.ownerId !== null && !repIds.has(account.ownerId)) {
        ctx.addIssue({
          code: "custom",
          message: `account "${account.domain}" is owned by unknown rep "${account.ownerId}"`,
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/**
 * Every enum here is the domain table's own list. A lead carrying a value the
 * domain has never heard of would mean the grid is not a partition of the
 * space, and every coverage proof downstream would be quietly false — so it is
 * refused at import rather than tolerated.
 */
export const leadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  emailDomain: exampleDomain,
  country: z.enum(COUNTRIES).nullable(),
  employees: z.number().int().min(EMPLOYEES_MIN).max(EMPLOYEES_MAX).nullable(),
  industry: z.enum(INDUSTRIES).nullable(),
  source: z.enum(SOURCES),
  seniority: z.enum(SENIORITIES).nullable(),
  language: z.enum(LANGUAGES),
  existingCustomer: z.boolean(),
  competitor: z.boolean(),
});

export const leadsSchema = z.array(leadSchema).superRefine((leads, ctx) => {
  const seen = new Set<string>();
  for (const lead of leads) {
    if (seen.has(lead.id)) {
      ctx.addIssue({ code: "custom", message: `duplicate lead id "${lead.id}"` });
    }
    seen.add(lead.id);
  }
});

// ---------------------------------------------------------------------------
// Cross-checks that need both halves
// ---------------------------------------------------------------------------

/**
 * A rule pointing at a team or queue that does not exist is a broken ruleset,
 * not a routing pathology, so it dies here. A rule pointing at a *departed* rep
 * is the opposite — a real, common, invisible defect — so it passes here and is
 * reported by `analyze.ts` as `NO_ELIGIBLE_OWNER`.
 */
export function assertRulesetTargetsResolve(ruleset: Ruleset, org: Org): void {
  const repIds = new Set(org.reps.map((r) => r.id));
  const teamIds = new Set(org.teams.map((t) => t.id));
  const queueIds = new Set(org.queues.map((q) => q.id));

  for (const rule of ruleset.rules) {
    const { target } = rule;
    if (target.kind === "rep" && !repIds.has(target.repId)) {
      throw new Error(`rule "${rule.id}" targets unknown rep "${target.repId}"`);
    }
    if (target.kind === "team" && !teamIds.has(target.teamId)) {
      throw new Error(`rule "${rule.id}" targets unknown team "${target.teamId}"`);
    }
    if (target.kind === "queue" && !queueIds.has(target.queueId)) {
      throw new Error(`rule "${rule.id}" targets unknown queue "${target.queueId}"`);
    }
  }
}

export type ParsedRuleset = z.infer<typeof rulesetSchema>;
export type ParsedOrg = z.infer<typeof orgSchema>;
export type ParsedLead = z.infer<typeof leadSchema>;
