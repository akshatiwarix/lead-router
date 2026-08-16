/**
 * Getting a ruleset out of the tab and an assignment list out of the app.
 *
 * The permalink uses `encodeURIComponent(JSON.stringify(...))` rather than
 * base64 — `btoa` is a host global and this package is not allowed any, and a
 * compression scheme would be a second thing to get right for a URL that is
 * already short enough at nineteen rules. The cost is a long link; the benefit
 * is that a reader can decode one by eye.
 *
 * The CSV keeps the whole trace, not just the owner. A row that says only
 * "Dana" is the format that lets a routing defect survive a quarter: it cannot
 * distinguish a lead Dana won from a lead that was pre-empted onto her, and it
 * cannot show that a second rule also wanted it.
 */

import { rulesetSchema } from "./schema";
import type { Assignment, Ruleset } from "./types";

// ---------------------------------------------------------------------------
// Permalink
// ---------------------------------------------------------------------------

export function encodeRuleset(ruleset: Ruleset): string {
  return encodeURIComponent(JSON.stringify(ruleset));
}

export type DecodeResult =
  | { ok: true; ruleset: Ruleset }
  | { ok: false; error: string };

/**
 * A permalink is untrusted input — it arrived from a URL bar. It goes through
 * the same Zod schema as the shipped corpus, and a bad one produces a message
 * rather than a half-loaded console.
 */
export function decodeRuleset(encoded: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(encoded));
  } catch {
    return { ok: false, error: "This link is not a ruleset — it could not be decoded." };
  }

  const result = rulesetSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: first
        ? `This link carries an invalid ruleset: ${first.path.join(".") || "(root)"} — ${first.message}`
        : "This link carries an invalid ruleset.",
    };
  }
  return { ok: true, ruleset: result.data };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  "lead_id",
  "lead_name",
  "company",
  "email_domain",
  "outcome",
  "preempted_by_account",
  "winning_rule",
  "also_matched",
  "eligible_reps",
  "selected_rep",
  "queue",
  "blocked_reason",
] as const;

function cell(value: string | null): string {
  // An empty cell and "nothing happened" are different facts, and a CSV that
  // conflates them re-creates the failure the repo is about. Every column that
  // can be absent writes the reason for its absence instead.
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export type CsvContext = {
  readonly leadName: (leadId: string) => string;
  readonly company: (leadId: string) => string;
  readonly emailDomain: (leadId: string) => string;
  readonly ruleName: (ruleId: string) => string;
  readonly repName: (repId: string) => string;
  readonly queueName: (queueId: string) => string;
};

export function assignmentsToCsv(
  assignments: readonly Assignment[],
  context: CsvContext,
): string {
  const rows = assignments.map((assignment) => {
    const alsoMatched = assignment.matchedRuleIds
      .filter((id) => id !== assignment.winningRuleId)
      .map(context.ruleName);

    return [
      assignment.leadId,
      context.leadName(assignment.leadId),
      context.company(assignment.leadId),
      context.emailDomain(assignment.leadId),
      assignment.outcome,
      assignment.preemptedByAccount ?? "—",
      assignment.winningRuleId ? context.ruleName(assignment.winningRuleId) : "no rule matched",
      alsoMatched.length > 0 ? alsoMatched.join(" | ") : "—",
      assignment.eligibleRepIds.length > 0
        ? assignment.eligibleRepIds.map(context.repName).join(" | ")
        : "none eligible",
      assignment.selectedRepId ? context.repName(assignment.selectedRepId) : "nobody",
      assignment.queueId ? context.queueName(assignment.queueId) : "—",
      assignment.blockedReason ?? "—",
    ].map(cell);
  });

  return [CSV_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
