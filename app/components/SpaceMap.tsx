"use client";

/**
 * The space map: two fields as axes, the rest pinned, one square per cell.
 *
 * This is the only place in the product where a hole stops being a bullet point
 * and becomes a thing you can see. It is also the place where it would be
 * easiest to lie, so two rules are enforced in the markup rather than in a
 * comment:
 *
 * The pinned slice is always printed above the grid. A two-dimensional view of
 * an eight-dimensional space is a projection, and rendering it without naming
 * the six values that were held constant would be lying with a picture.
 *
 * Uncovered cells are hatched rather than merely coloured. A hole is an absence,
 * it should read as one, and it should survive a greyscale screenshot.
 */

import { useMemo } from "react";
import {
  buildGrid,
  conditionBox,
  DOMAINS,
  FIELD_IDS,
  FIELD_LABELS,
  eligibleReps,
  type Atom,
  type FieldId,
  type Org,
  type Rule,
  type Ruleset,
} from "@/lib/routing";
import { Panel, selectClass } from "./ui";

function atomLabel(atom: Atom): string {
  if (atom.kind === "missing") return "—";
  if (atom.kind === "value") return atom.value;
  return atom.lo === atom.hi
    ? String(atom.lo)
    : `${atom.lo.toLocaleString()}–${atom.hi >= 500_000 ? "500k" : atom.hi.toLocaleString()}`;
}

type CellState =
  | { kind: "covered"; rule: Rule }
  | { kind: "contested"; rule: Rule; others: Rule[] }
  | { kind: "uncovered" };

export function SpaceMap({
  ruleset,
  org,
  axes,
  pins,
  onAxes,
  onPins,
  highlightRuleId,
}: {
  ruleset: Ruleset;
  org: Org;
  axes: { x: FieldId; y: FieldId };
  pins: Partial<Record<FieldId, number>>;
  onAxes: (next: { x: FieldId; y: FieldId }) => void;
  onPins: (next: Partial<Record<FieldId, number>>) => void;
  highlightRuleId: string | null;
}) {
  const grid = useMemo(() => buildGrid(ruleset), [ruleset]);

  const boxes = useMemo(
    () =>
      ruleset.rules
        .filter((rule) => rule.enabled)
        .map((rule) => ({ rule, box: conditionBox(rule.when, grid) })),
    [ruleset, grid],
  );

  // Two rules "agree" when they resolve to the same people, so a contest is a
  // real disagreement rather than two names for one team. Computed up front for
  // every rule: the map is read once per cell, and there are a few hundred.
  const ownerKeys = useMemo(
    () =>
      new Map(
        ruleset.rules.map((rule) => [
          rule.id,
          rule.target.kind === "queue"
            ? `queue:${rule.target.queueId}`
            : eligibleReps(rule.target, org)
                .map((rep) => rep.id)
                .sort()
                .join(","),
        ]),
      ),
    [ruleset, org],
  );
  const ownerKey = (rule: Rule) => ownerKeys.get(rule.id) ?? "";

  const pinned = FIELD_IDS.filter((field) => field !== axes.x && field !== axes.y);

  const atomFor = (field: FieldId) => pins[field] ?? 0;

  const cellState = (xIndex: number, yIndex: number): CellState => {
    const matching = boxes.filter(({ box }) => {
      if (!box[axes.x].has(xIndex) || !box[axes.y].has(yIndex)) return false;
      return pinned.every((field) => box[field].has(atomFor(field)));
    });
    const first = matching[0];
    if (!first) return { kind: "uncovered" };
    const disagreeing = matching
      .slice(1)
      .filter(({ rule }) => ownerKey(rule) !== ownerKey(first.rule))
      .map(({ rule }) => rule);
    return disagreeing.length > 0
      ? { kind: "contested", rule: first.rule, others: disagreeing }
      : { kind: "covered", rule: first.rule };
  };

  const xAtoms = grid.atoms[axes.x];
  const yAtoms = grid.atoms[axes.y];

  const slice = pinned
    .map((field) => `${FIELD_LABELS[field]} = ${atomLabel(grid.atoms[field][atomFor(field)]!)}`)
    .join(" · ");

  return (
    <Panel
      title="Space map"
      subtitle="One square per cell. Colour is the rule that wins there."
      right={
        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value={axes.x}
            onChange={(event) => onAxes({ ...axes, x: event.target.value as FieldId })}
          >
            {FIELD_IDS.filter((field) => field !== axes.y).map((field) => (
              <option key={field} value={field}>
                x: {FIELD_LABELS[field]}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={axes.y}
            onChange={(event) => onAxes({ ...axes, y: event.target.value as FieldId })}
          >
            {FIELD_IDS.filter((field) => field !== axes.x).map((field) => (
              <option key={field} value={field}>
                y: {FIELD_LABELS[field]}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <div className="px-4 py-3">
        {/* The projection, named. Never render the grid without this line. */}
        <p className="text-xs text-slate">
          A slice through an eight-field space. Held constant:{" "}
          <span className="font-mono text-ink">{slice}</span>
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {pinned.map((field) => (
            <label key={field} className="flex items-center gap-1.5">
              <span className="font-mono text-[0.6875rem] text-slate">{FIELD_LABELS[field]}</span>
              <select
                className={`${selectClass} !px-1 !py-0.5 !text-[0.6875rem]`}
                value={atomFor(field)}
                onChange={(event) => onPins({ ...pins, [field]: Number(event.target.value) })}
              >
                {grid.atoms[field].map((atom, index) => (
                  <option key={index} value={index}>
                    {atomLabel(atom)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-4 overflow-auto">
          <table className="border-separate border-spacing-0.5">
            <tbody>
              {yAtoms.map((yAtom, yIndex) => (
                <tr key={yIndex}>
                  <th className="pr-2 text-right align-middle font-mono text-[0.625rem] font-normal whitespace-nowrap text-slate">
                    {atomLabel(yAtom)}
                  </th>
                  {xAtoms.map((xAtom, xIndex) => {
                    const state = cellState(xIndex, yIndex);
                    const highlighted =
                      highlightRuleId !== null &&
                      state.kind !== "uncovered" &&
                      (state.rule.id === highlightRuleId ||
                        (state.kind === "contested" &&
                          state.others.some((other) => other.id === highlightRuleId)));

                    const title =
                      state.kind === "uncovered"
                        ? `${FIELD_LABELS[axes.x]} ${atomLabel(xAtom)}, ${FIELD_LABELS[axes.y]} ${atomLabel(yAtom)} — no rule claims this`
                        : state.kind === "contested"
                          ? `${state.rule.name} wins; ${state.others.map((o) => o.name).join(", ")} also match and disagree`
                          : `${state.rule.name}`;

                    const base = "h-7 w-7 rounded-[2px] border";
                    const look =
                      state.kind === "uncovered"
                        ? "hatch-uncovered border-uncovered/40"
                        : state.kind === "contested"
                          ? "bg-contested-soft border-contested"
                          : "bg-covered-soft border-covered/40";

                    return (
                      <td key={xIndex} className="p-0">
                        <div
                          title={title}
                          className={`${base} ${look} ${
                            highlighted ? "ring-2 ring-accent ring-offset-1" : ""
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th />
                {xAtoms.map((xAtom, xIndex) => (
                  <th
                    key={xIndex}
                    className="pt-1 align-top font-mono text-[0.5625rem] font-normal text-slate"
                  >
                    <span className="block w-7 truncate text-center" title={atomLabel(xAtom)}>
                      {atomLabel(xAtom)}
                    </span>
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 text-[0.6875rem] text-slate">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-covered/40 bg-covered-soft" />
            claimed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-contested bg-contested-soft" />
            two rules disagree; order decides
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hatch-uncovered h-3 w-3 rounded-[2px] border border-uncovered/40" />
            nothing claims it
          </span>
          <span className="ml-auto">
            {DOMAINS[axes.x].kind === "interval" || DOMAINS[axes.y].kind === "interval"
              ? "Numeric axes are cut where the rules cut, so square width is not proportional to headcount."
              : null}
          </span>
        </div>
      </div>
    </Panel>
  );
}
