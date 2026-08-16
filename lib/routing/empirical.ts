/**
 * The three corpus findings. Everything here is an *observation* — true of the
 * seventy leads in front of us, and not true of anything else.
 *
 * The separation from `analyze.ts` is the point of the module existing at all.
 * "Eleven of your leads fell into a hole" and "your ruleset has a hole" are
 * different sentences: the first is fixable by luck and disprovable by next
 * week's traffic, the second is a property of the artifact. A panel that adds
 * them into one number is telling the reader that a quiet week means a fixed
 * ruleset.
 *
 * The counts here are never converted into percentages of anything, for the
 * same reason `analyze.ts` refuses to: a proportion invites comparison against
 * a denominator that does not exist.
 */

import { regionContainsLead } from "./grid";
import { routePure, type RoutingConfig } from "./route";
import type {
  Analysis,
  EmpiricalFinding,
  EmpiricalFindingKind,
  Lead,
  Ruleset,
  Severity,
} from "./types";

const SEVERITY: Readonly<Record<EmpiricalFindingKind, Severity>> = {
  UNCOVERED_IN_PRACTICE: "SUSPECT",
  CONTESTED_IN_PRACTICE: "SUSPECT",
  PRE_EMPTED_IN_PRACTICE: "NOTE",
};

const observation = (
  kind: EmpiricalFindingKind,
  ruleId: string | null,
  detail: string,
  leadIds: readonly string[],
  relatedRuleIds: readonly string[] = [],
): EmpiricalFinding => ({
  class: "OBSERVATION",
  kind,
  severity: SEVERITY[kind],
  ruleId,
  relatedRuleIds,
  detail,
  leadIds,
});

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function observe(
  leads: readonly Lead[],
  ruleset: Ruleset,
  analysis: Analysis,
  config: RoutingConfig,
): EmpiricalFinding[] {
  const findings: EmpiricalFinding[] = [];
  const routed = leads.map((lead) => ({ lead, result: routePure(lead, config) }));
  const nameOf = (ruleId: string) =>
    ruleset.rules.find((rule) => rule.id === ruleId)?.name ?? ruleId;

  // --- Leads that actually fell in a hole ---------------------------------
  // Reported per uncovered region, so the reader can see which hole is
  // expensive. A hole with no leads in it is still a hole; it just is not
  // urgent, and the proof already said it exists.
  for (const proof of analysis.proofs) {
    if (proof.kind !== "UNCOVERED" || proof.region === null) continue;
    const inside = leads.filter((lead) => regionContainsLead(proof.region!, lead, analysis.grid));
    if (inside.length === 0) continue;
    findings.push(
      observation(
        "UNCOVERED_IN_PRACTICE",
        null,
        `${plural(inside.length, "lead", "leads")} in the corpus landed in this uncovered region and went to the catch-all.`,
        inside.map((lead) => lead.id),
      ),
    );
  }

  // --- Leads a contest actually decided ------------------------------------
  for (const proof of analysis.proofs) {
    if (proof.kind !== "CONTESTED" || proof.ruleId === null) continue;
    const ruleId = proof.ruleId;
    const affected = routed.filter(
      ({ result }) =>
        result.winningRuleId === ruleId &&
        result.matchedRuleIds.some((id) => proof.relatedRuleIds.includes(id)),
    );
    if (affected.length === 0) continue;
    findings.push(
      observation(
        "CONTESTED_IN_PRACTICE",
        ruleId,
        `${plural(affected.length, "lead", "leads")} went to “${nameOf(ruleId)}” while another rule also matched and would have sent ${affected.length === 1 ? "it" : "them"} elsewhere.`,
        affected.map(({ lead }) => lead.id),
        proof.relatedRuleIds,
      ),
    );
  }

  // --- Rules that are reachable on paper and starved in practice -----------
  // A rule can be perfectly live in the lead-space and still never fire,
  // because every lead that reaches it belongs to an account somebody already
  // owns. That is not something the static pass can know, and it is the single
  // most common reason a rep says "my rule doesn't work".
  for (const rule of ruleset.rules) {
    if (!rule.enabled) continue;
    const region = analysis.effective[rule.id];
    if (!region || region.length === 0) continue;

    const inRegion = routed.filter(({ lead }) => regionContainsLead(region, lead, analysis.grid));
    if (inRegion.length === 0) continue;
    const allPreempted = inRegion.every(({ result }) => result.preemptedByAccount !== null);
    if (!allPreempted) continue;

    findings.push(
      observation(
        "PRE_EMPTED_IN_PRACTICE",
        rule.id,
        `This rule can win leads, but all ${plural(inRegion.length, "corpus lead", "corpus leads")} that reach it belong to accounts that already have an owner, so pre-emption takes them first.`,
        inRegion.map(({ lead }) => lead.id),
      ),
    );
  }

  return findings;
}
