"use client";

/**
 * Proofs and observations, in two sections that never merge.
 *
 * The separation is the product. A proof is true of the whole lead-space and
 * was computed; an observation is true of these seventy leads and was counted.
 * They get different headings, different counts, different border styles, and
 * there is deliberately no total anywhere on this panel — a combined number
 * would tell the reader that a quiet week means a fixed ruleset.
 *
 * Notes are folded by kind rather than listed. Fifteen rules in the shipped
 * corpus are enrichment-dependent, each with a nearly identical sentence, and
 * printing all fifteen buries the three that are broken. Folding is not hiding:
 * the count is on the summary line and one click opens every one of them. What
 * would be dishonest is dropping them, and nothing here is dropped.
 */

import { useState } from "react";
import type { EmpiricalFinding, Severity, StaticFinding } from "@/lib/routing";
import { Empty, FindingBadge, Panel } from "./ui";

const SEVERITY_ORDER: Record<Severity, number> = { BROKEN: 0, SUSPECT: 1, NOTE: 2 };

type AnyFinding = StaticFinding | EmpiricalFinding;

function FindingRow({
  finding,
  onFocusRule,
  focusedRuleId,
}: {
  finding: AnyFinding;
  onFocusRule: (ruleId: string | null) => void;
  focusedRuleId: string | null;
}) {
  return (
    <li
      className={`border-b border-rule px-4 py-2.5 last:border-b-0 ${
        finding.ruleId && finding.ruleId === focusedRuleId ? "bg-accent-soft/40" : ""
      }`}
    >
      <FindingBadge
        kind={finding.kind}
        severity={finding.severity}
        epistemic={finding.class}
        onClick={finding.ruleId ? () => onFocusRule(finding.ruleId) : undefined}
        active={finding.ruleId === focusedRuleId}
      />
      <p className="mt-1.5 text-sm leading-snug text-ink">{finding.detail}</p>
      {finding.class === "OBSERVATION" ? (
        <p className="mt-1 font-mono text-[0.625rem] text-slate">{finding.leadIds.join(" ")}</p>
      ) : null}
    </li>
  );
}

function NoteGroup({
  kind,
  findings,
  onFocusRule,
  focusedRuleId,
}: {
  kind: string;
  findings: AnyFinding[];
  onFocusRule: (ruleId: string | null) => void;
  focusedRuleId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const first = findings[0]!;

  if (findings.length === 1) {
    return <FindingRow finding={first} onFocusRule={onFocusRule} focusedRuleId={focusedRuleId} />;
  }

  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-paper/70"
      >
        <FindingBadge kind={kind} severity={first.severity} epistemic={first.class} />
        <span className="text-sm text-ink">
          {findings.length} rules
          {kind === "ENRICHMENT_DEPENDENT" ? " cannot fire before enrichment lands" : ""}
        </span>
        <span className="ml-auto font-mono text-[0.625rem] text-slate">{open ? "hide" : "show"}</span>
      </button>
      {open ? (
        <ul className="border-t border-rule bg-paper/50">
          {findings.map((finding, index) => (
            <FindingRow
              key={`${finding.ruleId}-${index}`}
              finding={finding}
              onFocusRule={onFocusRule}
              focusedRuleId={focusedRuleId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Section({
  findings,
  onFocusRule,
  focusedRuleId,
}: {
  findings: AnyFinding[];
  onFocusRule: (ruleId: string | null) => void;
  focusedRuleId: string | null;
}) {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const loud = sorted.filter((finding) => finding.severity !== "NOTE");
  const notes = sorted.filter((finding) => finding.severity === "NOTE");

  const byKind = new Map<string, AnyFinding[]>();
  for (const note of notes) {
    byKind.set(note.kind, [...(byKind.get(note.kind) ?? []), note]);
  }

  return (
    <ul>
      {loud.map((finding, index) => (
        <FindingRow
          key={`${finding.kind}-${finding.ruleId}-${index}`}
          finding={finding}
          onFocusRule={onFocusRule}
          focusedRuleId={focusedRuleId}
        />
      ))}
      {[...byKind.entries()].map(([kind, group]) => (
        <NoteGroup
          key={kind}
          kind={kind}
          findings={group}
          onFocusRule={onFocusRule}
          focusedRuleId={focusedRuleId}
        />
      ))}
    </ul>
  );
}

export function FindingsPane({
  proofs,
  observations,
  onFocusRule,
  focusedRuleId,
}: {
  proofs: readonly StaticFinding[];
  observations: readonly EmpiricalFinding[];
  onFocusRule: (ruleId: string | null) => void;
  focusedRuleId: string | null;
}) {
  const count = (findings: readonly AnyFinding[], severity: Severity) =>
    findings.filter((finding) => finding.severity === severity).length;

  return (
    <Panel
      title="Findings"
      subtitle="Two kinds of statement, kept apart on purpose."
      className="max-h-[640px]"
    >
      <section className="border-b-4 border-double border-rule-strong">
        <header className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 border-b border-rule bg-proof-soft px-4 py-2">
          <h3 className="text-sm font-semibold text-proof">Proofs</h3>
          <p className="text-xs text-slate">true of the whole lead-space, computed</p>
          <p className="ml-auto font-mono text-[0.625rem] text-slate">
            {count(proofs, "BROKEN")} broken · {count(proofs, "SUSPECT")} suspect ·{" "}
            {count(proofs, "NOTE")} notes
          </p>
        </header>
        {proofs.length === 0 ? (
          <Empty>
            Nothing to prove against this ruleset. Every rule can fire and nothing is unclaimed.
          </Empty>
        ) : (
          <Section findings={[...proofs]} onFocusRule={onFocusRule} focusedRuleId={focusedRuleId} />
        )}
      </section>

      <section>
        <header className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 border-b border-rule bg-observation-soft px-4 py-2">
          <h3 className="text-sm font-semibold text-observation">Observations</h3>
          <p className="text-xs text-slate">true of the 70 leads in the corpus, counted</p>
          <p className="ml-auto font-mono text-[0.625rem] text-slate">
            {count(observations, "SUSPECT")} suspect · {count(observations, "NOTE")} notes
          </p>
        </header>
        {observations.length === 0 ? (
          <Empty>
            No lead in the corpus exercised any of this. That is not the same as nothing being
            wrong — read the proofs.
          </Empty>
        ) : (
          <Section
            findings={[...observations]}
            onFocusRule={onFocusRule}
            focusedRuleId={focusedRuleId}
          />
        )}
      </section>

      <p className="border-t border-rule px-4 py-3 text-[0.6875rem] leading-relaxed text-slate">
        There is no combined total, and no percentage of lead-space anywhere in this panel. Atom
        count is not lead volume, and a proportion would assume leads are spread evenly across
        every combination of country, size and industry — which no funnel has ever been.
      </p>
    </Panel>
  );
}
