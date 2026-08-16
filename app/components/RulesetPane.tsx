"use client";

/**
 * The ordered rule list — the artifact under analysis.
 *
 * Order is the decision procedure, so it is rendered as a numbered list you can
 * move things in, not as a set of cards. A rule that can never win is struck
 * through: the reader should be able to see the dead rules from across the room
 * without reading a single finding.
 */

import type { Analysis, Org, Rule, Ruleset } from "@/lib/routing";
import { findingsForRule } from "@/lib/routing";
import { RuleEditor } from "./RuleEditor";
import { FindingBadge, Panel } from "./ui";

function targetLabel(rule: Rule, org: Org): string {
  const { target } = rule;
  if (target.kind === "rep") {
    const rep = org.reps.find((candidate) => candidate.id === target.repId);
    return rep ? `${rep.name}${rep.active ? "" : " (departed)"}` : target.repId;
  }
  if (target.kind === "team") {
    return org.teams.find((team) => team.id === target.teamId)?.name ?? target.teamId;
  }
  if (target.kind === "queue") {
    return org.queues.find((queue) => queue.id === target.queueId)?.name ?? target.queueId;
  }
  return `attributes: ${[
    target.territory?.join("/"),
    target.languages?.join("/"),
    target.specialties?.join("/"),
  ]
    .filter(Boolean)
    .join(" · ")}`;
}

export function RulesetPane({
  ruleset,
  org,
  analysis,
  selectedRuleId,
  onSelect,
  onChange,
  right,
}: {
  ruleset: Ruleset;
  org: Org;
  analysis: Analysis;
  selectedRuleId: string | null;
  onSelect: (ruleId: string | null) => void;
  onChange: (next: Ruleset) => void;
  right?: React.ReactNode;
}) {
  const replace = (rule: Rule) =>
    onChange({
      ...ruleset,
      rules: ruleset.rules.map((candidate) => (candidate.id === rule.id ? rule : candidate)),
    });

  const move = (index: number, delta: number) => {
    const next = [...ruleset.rules];
    const target = index + delta;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange({ ...ruleset, rules: next });
  };

  return (
    <Panel
      title="Ruleset"
      subtitle={
        <>
          First enabled match wins. {ruleset.rules.length} rules — drag order matters, so it is
          shown.
        </>
      }
      right={right}
      className="max-h-[640px]"
    >
      <ol>
        {ruleset.rules.map((rule, index) => {
          const findings = findingsForRule(analysis, rule.id).filter(
            (finding) => finding.ruleId === rule.id,
          );
          const dead = findings.some(
            (finding) => finding.kind === "UNREACHABLE" || finding.kind === "UNSATISFIABLE",
          );
          const open = selectedRuleId === rule.id;

          return (
            <li key={rule.id} className="border-b border-rule last:border-b-0">
              <div
                className={`flex items-start gap-3 px-4 py-2.5 ${open ? "bg-accent-soft/40" : ""} ${
                  rule.enabled ? "" : "opacity-45"
                }`}
              >
                <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-slate">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSelect(open ? null : rule.id)}
                    className="block text-left"
                  >
                    <span
                      className={`text-sm font-medium ${dead ? "text-slate line-through decoration-dead/60" : "text-ink"}`}
                    >
                      {rule.name}
                    </span>
                  </button>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-slate">
                    → {targetLabel(rule, org)}
                  </p>
                  {findings.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {findings.map((finding, i) => (
                        <FindingBadge
                          key={`${finding.kind}-${i}`}
                          kind={finding.kind}
                          severity={finding.severity}
                          epistemic="PROOF"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded border border-rule-strong px-1.5 py-0.5 font-mono text-[0.625rem] text-slate disabled:opacity-30 hover:enabled:border-accent hover:enabled:text-accent"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="move down"
                    disabled={index === ruleset.rules.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded border border-rule-strong px-1.5 py-0.5 font-mono text-[0.625rem] text-slate disabled:opacity-30 hover:enabled:border-accent hover:enabled:text-accent"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => replace({ ...rule, enabled: !rule.enabled })}
                    className={`marking rounded border px-1.5 py-0.5 ${
                      rule.enabled
                        ? "border-rule-strong hover:border-accent hover:!text-accent"
                        : "border-accent !text-accent"
                    }`}
                  >
                    {rule.enabled ? "on" : "off"}
                  </button>
                </div>
              </div>

              {open ? (
                <RuleEditor
                  rule={rule}
                  org={org}
                  onChange={replace}
                  onClose={() => onSelect(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
