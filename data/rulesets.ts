/**
 * The default ruleset is the artifact under analysis. It is written the way
 * inherited rulesets are actually written — appended to over two years by four
 * different people, each of whom was solving one problem and none of whom could
 * see the whole — and it carries five of the six named traps on purpose.
 *
 * A note on the shape, because it is the most common real pattern and the most
 * commonly misread: the regional rules carry `industry notIn {healthcare,
 * government}` because a specialist desk was introduced later and the regional
 * rules were amended to get out of its way. That amendment is where the hole
 * came from. `notIn` also excludes the unenriched value, so leads whose
 * industry has not resolved fall past the regional rules too — which nobody
 * intended and nobody noticed.
 *
 * The four other rulesets are single-pathology demos. They exist so a reader
 * can see one finding in isolation before meeting all of them at once.
 */

import { rulesetSchema } from "@/lib/routing/schema";
import type { Ruleset } from "@/lib/routing/types";
import { QUEUE_CATCHALL, QUEUE_DO_NOT_ROUTE } from "./org";

const EMEA = ["FR", "DE", "UK", "ES", "IT"] as const;
const AMER = ["US", "CA", "BR"] as const;
const REGULATED = ["healthcare", "government"] as const;

const inherited = {
  id: "rs-inherited",
  name: "Inherited ruleset",
  description:
    "Nineteen rules, appended to over two years. Five of the six named traps live in here.",
  rules: [
    {
      id: "rl-competitor",
      name: "Competitors never reach a rep",
      when: { competitor: { kind: "is", value: true } },
      target: { kind: "queue", queueId: QUEUE_DO_NOT_ROUTE },
      enabled: true,
    },
    {
      id: "rl-existing-customer",
      name: "Existing customers go to the CS catch-all",
      when: { existingCustomer: { kind: "is", value: true } },
      target: { kind: "queue", queueId: QUEUE_CATCHALL },
      enabled: true,
    },
    {
      id: "rl-partner-referral",
      name: "Partner referrals to the partner desk",
      when: { source: { kind: "in", values: ["partner_referral"] } },
      target: { kind: "rep", repId: "r-tom" },
      enabled: true,
    },
    {
      // Added by a VP after one bad quarter. Overlaps the partner rule above and
      // disagrees with it; the partner rule wins purely because it is higher.
      id: "rl-c-level",
      name: "Anything C-level goes to Enterprise",
      when: { seniority: { kind: "in", values: ["c_level"] } },
      target: { kind: "team", teamId: "t-ent" },
      enabled: true,
    },
    {
      id: "rl-enterprise",
      name: "Enterprise by headcount",
      when: { employees: { kind: "between", lo: 1000, hi: 500_000 } },
      target: { kind: "team", teamId: "t-ent" },
      enabled: true,
    },
    {
      // The specialist desk. Mid-market only — which is how the hole below it
      // got there.
      id: "rl-regulated-mid",
      name: "Regulated industries to the specialist",
      when: {
        industry: { kind: "in", values: [...REGULATED] },
        employees: { kind: "between", lo: 50, hi: 999 },
      },
      target: { kind: "rep", repId: "r-dana" },
      enabled: true,
    },
    {
      // Written when Hana covered German-speaking APAC. She left in March.
      id: "rl-japan-german",
      name: "German-speaking Japan to a German-speaking APAC rep",
      when: {
        country: { kind: "in", values: ["JP"] },
        language: { kind: "in", values: ["de"] },
      },
      target: { kind: "attributes", territory: ["JP"], languages: ["de"] },
      enabled: true,
    },
    {
      id: "rl-japan",
      name: "Japan",
      when: { country: { kind: "in", values: ["JP"] } },
      target: { kind: "rep", repId: "r-akira" },
      enabled: true,
    },
    {
      id: "rl-apac",
      name: "Rest of APAC",
      when: { country: { kind: "in", values: ["SG", "AU", "IN"] } },
      target: { kind: "rep", repId: "r-akira" },
      enabled: true,
    },
    {
      // The UK team asked for the upper half of their mid-market by name. It
      // was written without the regulated-industry carve-out the regional rules
      // carry, so it is not a clean refinement of the rule below — it takes a
      // bite out of EMEA mid-market along exactly the dimensions that rule's
      // author was reasoning about.
      id: "rl-uk-upper-mid",
      name: "UK upper mid-market to Priya",
      when: {
        country: { kind: "in", values: ["UK"] },
        employees: { kind: "between", lo: 200, hi: 999 },
      },
      target: { kind: "rep", repId: "r-priya" },
      enabled: true,
    },
    {
      id: "rl-emea-mid",
      name: "EMEA mid-market",
      when: {
        country: { kind: "in", values: [...EMEA] },
        employees: { kind: "between", lo: 50, hi: 999 },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      // Added the week the Paris office opened. It does nothing: the rule below
      // already sends the same leads to the same team.
      id: "rl-france-smb",
      name: "France SMB",
      when: {
        country: { kind: "in", values: ["FR"] },
        employees: { kind: "between", lo: 1, hi: 49 },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "rl-emea-smb",
      name: "EMEA SMB",
      when: {
        country: { kind: "in", values: [...EMEA] },
        employees: { kind: "between", lo: 1, hi: 49 },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "rl-amer-mid",
      name: "AMER mid-market",
      when: {
        country: { kind: "in", values: [...AMER] },
        employees: { kind: "between", lo: 50, hi: 999 },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-amer" },
      enabled: true,
    },
    {
      id: "rl-amer-smb",
      name: "AMER SMB",
      when: {
        country: { kind: "in", values: [...AMER] },
        employees: { kind: "between", lo: 1, hi: 49 },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-amer" },
      enabled: true,
    },
    {
      // Marie asked for this in month nine. The global enterprise rule in month
      // three already took every lead it describes. It has never fired.
      id: "rl-france-enterprise",
      name: "France enterprise to Noor",
      when: {
        country: { kind: "in", values: ["FR"] },
        employees: { kind: "between", lo: 1000, hi: 500_000 },
      },
      target: { kind: "rep", repId: "r-noor" },
      enabled: true,
    },
    {
      // The bounds were typed the wrong way round and nothing ever complained.
      id: "rl-iberia-midmarket",
      name: "Iberia and Italy mid-market",
      when: {
        country: { kind: "in", values: ["ES", "IT"] },
        employees: { kind: "between", lo: 500, hi: 200 },
      },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "rl-emea-unenriched",
      name: "EMEA, headcount not yet resolved",
      when: {
        country: { kind: "in", values: [...EMEA] },
        employees: { kind: "missing" },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "rl-amer-unenriched",
      name: "AMER, headcount not yet resolved",
      when: {
        country: { kind: "in", values: [...AMER] },
        employees: { kind: "missing" },
        industry: { kind: "notIn", values: [...REGULATED] },
      },
      target: { kind: "team", teamId: "t-amer" },
      enabled: true,
    },
  ],
};

const clean = {
  id: "rs-clean",
  name: "Clean ruleset",
  description:
    "Total coverage, no dead rules, nothing contested. The control — and it still carries three notes, because every geographic rule needs a country that enrichment has not always returned.",
  rules: [
    {
      id: "c-emea",
      name: "EMEA",
      when: { country: { kind: "in", values: [...EMEA] } },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "c-amer",
      name: "AMER",
      when: { country: { kind: "in", values: [...AMER] } },
      target: { kind: "team", teamId: "t-amer" },
      enabled: true,
    },
    {
      id: "c-apac",
      name: "APAC",
      when: { country: { kind: "in", values: ["JP", "SG", "AU", "IN"] } },
      target: { kind: "rep", repId: "r-akira" },
      enabled: true,
    },
    {
      id: "c-rest",
      name: "Everything else, including leads with no country yet",
      when: {},
      target: { kind: "queue", queueId: QUEUE_CATCHALL },
      enabled: true,
    },
  ],
};

const shadowed = {
  id: "rs-shadowed",
  name: "One dead rule",
  description:
    "Three rules. The third describes leads the first already took, so it can never fire — the single most common defect in an inherited ruleset.",
  rules: [
    {
      id: "s-enterprise",
      name: "Enterprise by headcount",
      when: { employees: { kind: "between", lo: 1000, hi: 500_000 } },
      target: { kind: "team", teamId: "t-ent" },
      enabled: true,
    },
    {
      id: "s-rest",
      name: "Everything else",
      when: {},
      target: { kind: "queue", queueId: QUEUE_CATCHALL },
      enabled: true,
    },
    {
      id: "s-germany-enterprise",
      name: "German enterprise to Noor",
      when: {
        country: { kind: "in", values: ["DE"] },
        employees: { kind: "between", lo: 1000, hi: 500_000 },
      },
      target: { kind: "rep", repId: "r-noor" },
      enabled: true,
    },
  ],
};

const contested = {
  id: "rs-contested",
  name: "Two teams, one region",
  description:
    "The partner desk and the enterprise team both claim partner-sourced enterprise leads and disagree about the owner. Line order decides, invisibly.",
  rules: [
    {
      id: "x-partner",
      name: "Partner referrals to the partner desk",
      when: { source: { kind: "in", values: ["partner_referral"] } },
      target: { kind: "rep", repId: "r-tom" },
      enabled: true,
    },
    {
      id: "x-enterprise",
      name: "Enterprise by headcount",
      when: { employees: { kind: "between", lo: 1000, hi: 500_000 } },
      target: { kind: "team", teamId: "t-ent" },
      enabled: true,
    },
    {
      id: "x-rest",
      name: "Everything else",
      when: {},
      target: { kind: "queue", queueId: QUEUE_CATCHALL },
      enabled: true,
    },
  ],
};

const uncovered = {
  id: "rs-uncovered",
  name: "A hole with a shape",
  description:
    "Every rule needs a resolved headcount. Nothing routes a lead whose enrichment has not come back yet — a hole that is invisible until you ask what shape it is.",
  rules: [
    {
      id: "u-smb",
      name: "SMB",
      when: { employees: { kind: "between", lo: 1, hi: 49 } },
      target: { kind: "team", teamId: "t-emea" },
      enabled: true,
    },
    {
      id: "u-mid",
      name: "Mid-market",
      when: { employees: { kind: "between", lo: 50, hi: 999 } },
      target: { kind: "team", teamId: "t-amer" },
      enabled: true,
    },
    {
      id: "u-enterprise",
      name: "Enterprise",
      when: { employees: { kind: "between", lo: 1000, hi: 500_000 } },
      target: { kind: "team", teamId: "t-ent" },
      enabled: true,
    },
  ],
};

export const INHERITED_RULESET: Ruleset = rulesetSchema.parse(inherited);

export const PRESETS: readonly Ruleset[] = [
  INHERITED_RULESET,
  rulesetSchema.parse(clean),
  rulesetSchema.parse(shadowed),
  rulesetSchema.parse(contested),
  rulesetSchema.parse(uncovered),
];
