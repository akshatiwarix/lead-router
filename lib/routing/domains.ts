/**
 * The eight lead fields and their declared universes.
 *
 * This is the only place a field's domain is written down, and the exactness
 * of every proof in `analyze.ts` rests on it being complete. If a lead can
 * carry a value that is not in the enum here, the grid is not a partition of
 * the space and every coverage claim is quietly false — so `schema.ts` refuses
 * such a lead at import rather than letting it through.
 *
 * `nullable: true` means the field can arrive unenriched. Four of the eight
 * cannot: `source`, `language`, `existingCustomer` and `competitor` are known
 * at capture, before any enrichment provider is called.
 */

import type { Domain, DomainTable, FieldId } from "./types";
import { FIELD_IDS } from "./types";

export const COUNTRIES = [
  "FR",
  "DE",
  "UK",
  "ES",
  "IT",
  "US",
  "CA",
  "BR",
  "IN",
  "JP",
  "AU",
  "SG",
] as const;

export const INDUSTRIES = [
  "saas",
  "fintech",
  "healthcare",
  "ecommerce",
  "manufacturing",
  "education",
  "government",
  "nonprofit",
  "other",
] as const;

export const SOURCES = [
  "demo_request",
  "content_download",
  "webinar",
  "free_trial",
  "partner_referral",
  "outbound_reply",
  "event",
  "chat",
] as const;

export const SENIORITIES = ["c_level", "vp", "director", "manager", "ic", "other"] as const;

export const LANGUAGES = ["en", "fr", "de", "es", "pt", "ja"] as const;

/** The largest headcount the model represents. Beyond it, everything routes the
 *  same way, so extending the ceiling would add atoms without adding meaning. */
export const EMPLOYEES_MIN = 1;
export const EMPLOYEES_MAX = 500_000;

export const DOMAINS: DomainTable = {
  country: { kind: "enum", values: COUNTRIES, nullable: true },
  employees: { kind: "interval", lo: EMPLOYEES_MIN, hi: EMPLOYEES_MAX, nullable: true },
  industry: { kind: "enum", values: INDUSTRIES, nullable: true },
  source: { kind: "enum", values: SOURCES, nullable: false },
  seniority: { kind: "enum", values: SENIORITIES, nullable: true },
  language: { kind: "enum", values: LANGUAGES, nullable: false },
  existingCustomer: { kind: "bool", nullable: false },
  competitor: { kind: "bool", nullable: false },
};

/** Rendered above the space map and in every finding description. */
export const FIELD_LABELS: Readonly<Record<FieldId, string>> = {
  country: "country",
  employees: "employees",
  industry: "industry",
  source: "source",
  seniority: "seniority",
  language: "language",
  existingCustomer: "existing customer",
  competitor: "competitor",
};

export function domainOf(field: FieldId): Domain {
  return DOMAINS[field];
}

export function isNullable(field: FieldId): boolean {
  return DOMAINS[field].nullable;
}

/** The declared values of an enum or boolean field, in declaration order. */
export function valuesOf(field: FieldId): readonly string[] {
  const domain = DOMAINS[field];
  if (domain.kind === "enum") return domain.values;
  if (domain.kind === "bool") return ["false", "true"];
  return [];
}

export { FIELD_IDS };
