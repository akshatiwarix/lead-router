"use client";

/**
 * Seventy leads and what happened to each.
 *
 * The expanded trace is the part that matters. A routing tool that shows only
 * the owner cannot distinguish a lead a rep won from a lead pre-empted onto
 * them, cannot show that a second rule also wanted it, and cannot show that
 * three people were eligible and a counter picked one. All four facts are on
 * screen here, in the order the pipeline produced them.
 */

import { useState } from "react";
import type { Assignment, Lead, Org, Outcome, Ruleset, SelectionStrategy } from "@/lib/routing";
import { STRATEGY_NOTES } from "@/lib/routing";
import { Panel, Pill } from "./ui";

const OUTCOME_TONE: Record<Outcome, "neutral" | "covered" | "dead" | "blocked"> = {
  ROUTED: "covered",
  PREEMPTED: "neutral",
  SUPPRESSED: "neutral",
  BLOCKED: "blocked",
  FALLBACK: "dead",
};

export function LeadsPane({
  leads,
  assignments,
  ruleset,
  org,
  strategy,
  right,
}: {
  leads: readonly Lead[];
  assignments: readonly Assignment[];
  ruleset: Ruleset;
  org: Org;
  strategy: SelectionStrategy;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const leadOf = (id: string) => leads.find((lead) => lead.id === id);
  const ruleName = (id: string) => ruleset.rules.find((rule) => rule.id === id)?.name ?? id;
  const repName = (id: string) => org.reps.find((rep) => rep.id === id)?.name ?? id;
  const queueName = (id: string) => org.queues.find((queue) => queue.id === id)?.name ?? id;

  const reproducible = strategy === "FIRST_ELIGIBLE";

  return (
    <Panel
      title="Leads"
      subtitle={
        reproducible ? (
          "Reproducible: the same lead always reaches the same rep."
        ) : (
          <span className="text-dead">
            Not reproducible — {STRATEGY_NOTES[strategy]} The findings above are unaffected.
          </span>
        )
      }
      right={right}
      className="max-h-[640px]"
    >
      <ul>
        {assignments.map((assignment) => {
          const lead = leadOf(assignment.leadId);
          if (!lead) return null;
          const expanded = open === assignment.leadId;
          const alsoMatched = assignment.matchedRuleIds.filter(
            (id) => id !== assignment.winningRuleId,
          );

          return (
            <li key={assignment.leadId} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : assignment.leadId)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-paper/70 ${
                  expanded ? "bg-accent-soft/40" : ""
                }`}
              >
                <span className="w-14 shrink-0 font-mono text-[0.6875rem] text-slate">
                  {lead.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {lead.name}
                  <span className="text-slate"> · {lead.company}</span>
                </span>
                <Pill tone={OUTCOME_TONE[assignment.outcome]}>{assignment.outcome}</Pill>
                <span className="w-36 shrink-0 truncate text-right text-xs text-slate">
                  {assignment.selectedRepId
                    ? repName(assignment.selectedRepId)
                    : assignment.queueId
                      ? queueName(assignment.queueId)
                      : "nobody"}
                </span>
              </button>

              {expanded ? (
                <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 border-t border-rule bg-paper/60 px-4 py-3 text-xs">
                  <dt className="marking">the lead</dt>
                  <dd className="font-mono text-[0.6875rem] text-ink">
                    {lead.country ?? "country —"} · {lead.employees?.toLocaleString() ?? "size —"} ·{" "}
                    {lead.industry ?? "industry —"} · {lead.source} · {lead.seniority ?? "role —"} ·{" "}
                    {lead.language}
                    {lead.existingCustomer ? " · existing customer" : ""}
                    {lead.competitor ? " · competitor" : ""}
                  </dd>

                  <dt className="marking">1 · pre-emption</dt>
                  <dd className="text-ink">
                    {assignment.preemptedByAccount ? (
                      <>
                        <span className="font-mono">{assignment.preemptedByAccount}</span> already
                        has an owner
                        {assignment.blockedReason === "DEPARTED_ACCOUNT_OWNER" ? (
                          <span className="text-blocked">
                            {" "}
                            — who has left. The lead stops here rather than falling through to the
                            rules.
                          </span>
                        ) : (
                          ". The rules never ran."
                        )}
                      </>
                    ) : (
                      <span className="text-slate">no owned account for this domain</span>
                    )}
                  </dd>

                  <dt className="marking">2 · matched</dt>
                  <dd className="text-ink">
                    {assignment.matchedRuleIds.length === 0 ? (
                      <span className="text-dead">
                        no rule matched — this lead is in a hole in the ruleset
                      </span>
                    ) : (
                      <>
                        <span className="font-medium">
                          {assignment.winningRuleId ? ruleName(assignment.winningRuleId) : "—"}
                        </span>
                        {alsoMatched.length > 0 ? (
                          <span className="text-slate">
                            {" "}
                            · also matched, and lost on line order:{" "}
                            {alsoMatched.map(ruleName).join(", ")}
                          </span>
                        ) : null}
                      </>
                    )}
                  </dd>

                  <dt className="marking">3 · eligible</dt>
                  <dd className="text-ink">
                    {assignment.eligibleRepIds.length === 0 ? (
                      <span className="text-blocked">
                        nobody
                        {assignment.blockedReason === "EMPTY_TARGET"
                          ? " — the rule resolves to no active rep"
                          : ""}
                      </span>
                    ) : (
                      assignment.eligibleRepIds.map(repName).join(", ")
                    )}
                  </dd>

                  <dt className="marking">4 · selected</dt>
                  <dd className={reproducible ? "text-ink" : "text-dead"}>
                    {assignment.selectedRepId ? repName(assignment.selectedRepId) : "nobody"}
                    {assignment.outcome === "ROUTED" && !reproducible ? (
                      <span> — chosen by a counter, not by this lead</span>
                    ) : null}
                  </dd>
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
