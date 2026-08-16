"use client";

/**
 * The console.
 *
 * Every derivation happens here, in `useMemo`, on the client — the engine ships
 * to the browser precisely so that editing a rule re-derives every finding and
 * every assignment with no round trip. A version that posted the ruleset to a
 * server would work, and would quietly make the analysis feel like a report
 * rather than a property of what is on screen.
 */

import { useMemo, useState } from "react";
import {
  analyze,
  assignmentsToCsv,
  blastRadius,
  buildGrid,
  createSelector,
  encodeRuleset,
  observe,
  routeAll,
  STRATEGY_LABELS,
  valuesOf,
  type FieldId,
  type Lead,
  type Org,
  type Ruleset,
  type SelectionStrategy,
} from "@/lib/routing";
import { FindingsPane } from "./FindingsPane";
import { LeadsPane } from "./LeadsPane";
import { RulesetPane } from "./RulesetPane";
import { SpaceMap } from "./SpaceMap";
import { TranslatePanel } from "./TranslatePanel";
import { selectClass } from "./ui";

const STRATEGIES: SelectionStrategy[] = ["FIRST_ELIGIBLE", "ROUND_ROBIN", "LEAST_LOADED"];

export function Console({
  presets,
  org,
  leads,
  fallbackQueueId,
  initialRuleset,
  linkError,
}: {
  presets: readonly Ruleset[];
  org: Org;
  leads: readonly Lead[];
  fallbackQueueId: string;
  /** A ruleset decoded from a permalink on the server, already validated. */
  initialRuleset: Ruleset | null;
  linkError: string | null;
}) {
  const initial = initialRuleset ?? presets[0]!;
  const [baseline, setBaseline] = useState<Ruleset>(initial);
  const [ruleset, setRuleset] = useState<Ruleset>(initial);
  const [strategy, setStrategy] = useState<SelectionStrategy>("FIRST_ELIGIBLE");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [axes, setAxes] = useState<{ x: FieldId; y: FieldId }>({
    x: "country",
    y: "employees",
  });
  // The map opens on an ordinary lead, not on atom index 0 of every field.
  // Index 0 for `seniority` is `c_level`, and the C-level rule cuts across the
  // whole geography — so the default slice would show almost every cell as
  // contested and read as a broken product rather than a typical one.
  const [pins, setPins] = useState<Partial<Record<FieldId, number>>>(() => ({
    industry: valuesOf("industry").indexOf("saas"),
    source: valuesOf("source").indexOf("demo_request"),
    seniority: valuesOf("seniority").indexOf("director"),
    language: valuesOf("language").indexOf("en"),
    existingCustomer: 0,
    competitor: 0,
  }));
  const [linkNote, setLinkNote] = useState<string | null>(linkError);

  const config = useMemo(() => ({ ruleset, org, fallbackQueueId }), [ruleset, org, fallbackQueueId]);
  const grid = useMemo(() => buildGrid(ruleset), [ruleset]);
  const analysis = useMemo(() => analyze(ruleset, org, grid), [ruleset, org, grid]);
  const observations = useMemo(
    () => observe(leads, ruleset, analysis, config),
    [leads, ruleset, analysis, config],
  );
  const assignments = useMemo(
    () => routeAll(leads, config, createSelector(strategy, org)),
    [leads, config, strategy, org],
  );
  const radius = useMemo(
    () => blastRadius(leads, config, baseline, ruleset),
    [leads, config, baseline, ruleset],
  );

  const edited = baseline !== ruleset;

  const loadPreset = (id: string) => {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    setBaseline(preset);
    setRuleset(preset);
    setSelectedRuleId(null);
    setLinkNote(null);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?r=${encodeRuleset(ruleset)}`;
    await navigator.clipboard.writeText(url);
    setLinkNote("Link copied. It carries the whole ruleset, so it decodes without a server.");
  };

  const downloadCsv = () => {
    const csv = assignmentsToCsv(assignments, {
      leadName: (id) => leads.find((lead) => lead.id === id)?.name ?? id,
      company: (id) => leads.find((lead) => lead.id === id)?.company ?? id,
      emailDomain: (id) => leads.find((lead) => lead.id === id)?.emailDomain ?? id,
      ruleName: (id) => ruleset.rules.find((rule) => rule.id === id)?.name ?? id,
      repName: (id) => org.reps.find((rep) => rep.id === id)?.name ?? id,
      queueName: (id) => org.queues.find((queue) => queue.id === id)?.name ?? id,
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "assignments.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="marking">Day 009 · static analysis for routing rulesets</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Lead Router</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            A routing ruleset is a program, and it is the only one your company ships with no
            tests. This one proves which rules can never fire, which regions of lead-space nothing
            claims, which leads two rules both want, and what your pending edit moves.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="marking">ruleset</span>
            <select className={selectClass} value={baseline.id} onChange={(e) => loadPreset(e.target.value)}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="marking">selection</span>
            <select
              className={selectClass}
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as SelectionStrategy)}
            >
              {STRATEGIES.map((option) => (
                <option key={option} value={option}>
                  {STRATEGY_LABELS[option]}
                  {option === "FIRST_ELIGIBLE" ? "" : " (not reproducible)"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={copyLink}
            className="marking rounded border border-rule-strong bg-card px-2 py-1.5 hover:border-accent hover:!text-accent"
          >
            copy link
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="marking rounded border border-rule-strong bg-card px-2 py-1.5 hover:border-accent hover:!text-accent"
          >
            export csv
          </button>
        </div>
      </header>

      <p className="text-xs text-slate">{baseline.description}</p>

      {linkNote ? (
        <p className="rounded border border-rule-strong bg-card px-3 py-2 text-xs text-ink">
          {linkNote}
        </p>
      ) : null}

      {edited ? (
        <div className="rounded border border-accent/40 bg-accent-soft px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">Blast radius.</span> Your edit moves{" "}
            <span className="font-mono">{radius.moved.length}</span> of{" "}
            <span className="font-mono">{leads.length}</span> leads.
            {radius.moved.length === 0
              ? " Nothing you have changed so far reaches a different person."
              : ""}
          </p>
          {radius.moved.length > 0 ? (
            <ul className="mt-2 space-y-0.5 font-mono text-[0.6875rem] text-slate">
              {radius.moved.slice(0, 12).map((move) => (
                <li key={move.leadId}>
                  {move.leadId}: {move.before.outcome}
                  {move.before.selectedRepId
                    ? ` → ${org.reps.find((r) => r.id === move.before.selectedRepId)?.name}`
                    : ""}{" "}
                  ⇒ {move.after.outcome}
                  {move.after.selectedRepId
                    ? ` → ${org.reps.find((r) => r.id === move.after.selectedRepId)?.name}`
                    : ""}
                </li>
              ))}
              {radius.moved.length > 12 ? (
                <li className="text-slate">…and {radius.moved.length - 12} more</li>
              ) : null}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => setRuleset(baseline)}
            className="marking mt-2 rounded border border-rule-strong bg-card px-2 py-1 hover:border-accent hover:!text-accent"
          >
            discard the edit
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <RulesetPane
            ruleset={ruleset}
            org={org}
            analysis={analysis}
            selectedRuleId={selectedRuleId}
            onSelect={setSelectedRuleId}
            onChange={setRuleset}
            right={
              <TranslatePanel
                onRule={(rule) => {
                  setRuleset({ ...ruleset, rules: [...ruleset.rules, rule] });
                  setSelectedRuleId(rule.id);
                }}
              />
            }
          />
          <SpaceMap
            ruleset={ruleset}
            org={org}
            axes={axes}
            pins={pins}
            onAxes={setAxes}
            onPins={setPins}
            highlightRuleId={selectedRuleId}
          />
        </div>

        <div className="flex flex-col gap-4">
          <FindingsPane
            proofs={analysis.proofs}
            observations={observations}
            onFocusRule={setSelectedRuleId}
            focusedRuleId={selectedRuleId}
          />
          <LeadsPane
            leads={leads}
            assignments={assignments}
            ruleset={ruleset}
            org={org}
            strategy={strategy}
          />
        </div>
      </div>

      <footer className="mt-4 border-t border-rule pt-4 text-[0.6875rem] leading-relaxed text-slate">
        Corpus is authored and synthetic — every domain ends in <code>.example</code> and no real
        company or person is described. There is no clock in this product: no SLAs, no timers, no
        reassignment. There is no simulation: the corpus is evaluated once, not replayed. And there
        is no score.
      </footer>
    </main>
  );
}
