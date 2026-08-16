"use client";

/**
 * Editing one rule.
 *
 * The editor is a direct rendering of the rule language and nothing more: eight
 * fields, one constraint each, and the constraint kinds each field's domain
 * actually permits. There is no free-text expression box, because there is no
 * free-text expression language — and a UI that implied otherwise would be
 * promising an analysis the engine could not deliver.
 */

import { DOMAINS, FIELD_IDS, FIELD_LABELS, type Condition, type Constraint, type FieldId, type Org, type Rule, type Target } from "@/lib/routing";
import { Field, inputClass, selectClass } from "./ui";

type ConstraintKind = Constraint["kind"] | "any";

function kindsFor(field: FieldId): ConstraintKind[] {
  const domain = DOMAINS[field];
  const base: ConstraintKind[] =
    domain.kind === "enum"
      ? ["any", "in", "notIn"]
      : domain.kind === "interval"
        ? ["any", "between"]
        : ["any", "is"];
  return domain.nullable ? [...base, "missing", "present"] : base;
}

const KIND_LABEL: Record<ConstraintKind, string> = {
  any: "any",
  in: "is one of",
  notIn: "is not one of",
  between: "between",
  is: "is",
  missing: "not yet enriched",
  present: "enriched (any value)",
};

function defaultConstraint(field: FieldId, kind: ConstraintKind): Constraint | undefined {
  const domain = DOMAINS[field];
  switch (kind) {
    case "any":
      return undefined;
    case "in":
    case "notIn":
      return { kind, values: [] };
    case "between":
      return domain.kind === "interval"
        ? { kind: "between", lo: domain.lo, hi: domain.hi }
        : undefined;
    case "is":
      return { kind: "is", value: true };
    case "missing":
      return { kind: "missing" };
    case "present":
      return { kind: "present" };
  }
}

function ConstraintRow({
  field,
  constraint,
  onChange,
}: {
  field: FieldId;
  constraint: Constraint | undefined;
  onChange: (next: Constraint | undefined) => void;
}) {
  const domain = DOMAINS[field];
  const kind: ConstraintKind = constraint?.kind ?? "any";

  return (
    <div className="grid grid-cols-[8rem_9rem_1fr] items-start gap-2 border-b border-rule py-2 last:border-b-0">
      <span className="pt-1 font-mono text-xs text-ink">{FIELD_LABELS[field]}</span>
      <select
        className={selectClass}
        value={kind}
        onChange={(event) => onChange(defaultConstraint(field, event.target.value as ConstraintKind))}
      >
        {kindsFor(field).map((option) => (
          <option key={option} value={option}>
            {KIND_LABEL[option]}
          </option>
        ))}
      </select>

      <div className="min-w-0">
        {(constraint?.kind === "in" || constraint?.kind === "notIn") && domain.kind === "enum" ? (
          <div className="flex flex-wrap gap-1">
            {domain.values.map((value) => {
              const on = constraint.values.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange({
                      kind: constraint.kind,
                      values: on
                        ? constraint.values.filter((v) => v !== value)
                        : [...constraint.values, value],
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 font-mono text-[0.6875rem] ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-rule-strong bg-card text-slate hover:border-accent"
                  }`}
                >
                  {value}
                </button>
              );
            })}
            {constraint.values.length === 0 ? (
              // An empty list is well-formed and describes nothing. It is left
              // editable rather than blocked, because it is exactly the state a
              // half-finished rule is in — and `analyze.ts` says so.
              <span className="ml-1 self-center text-[0.6875rem] text-dead">
                nothing selected — this rule matches no lead
              </span>
            ) : null}
          </div>
        ) : null}

        {constraint?.kind === "between" ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className={`${inputClass} w-28`}
              value={constraint.lo}
              onChange={(event) =>
                onChange({ kind: "between", lo: Number(event.target.value), hi: constraint.hi })
              }
            />
            <span className="text-xs text-slate">to</span>
            <input
              type="number"
              className={`${inputClass} w-28`}
              value={constraint.hi}
              onChange={(event) =>
                onChange({ kind: "between", lo: constraint.lo, hi: Number(event.target.value) })
              }
            />
            {constraint.lo > constraint.hi ? (
              <span className="text-[0.6875rem] text-dead">lower bound is above the upper one</span>
            ) : null}
          </div>
        ) : null}

        {constraint?.kind === "is" ? (
          <select
            className={selectClass}
            value={String(constraint.value)}
            onChange={(event) => onChange({ kind: "is", value: event.target.value === "true" })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : null}
      </div>
    </div>
  );
}

function TargetEditor({
  target,
  org,
  onChange,
}: {
  target: Target;
  org: Org;
  onChange: (next: Target) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClass}
        value={target.kind}
        onChange={(event) => {
          const kind = event.target.value as Target["kind"];
          if (kind === "rep") onChange({ kind, repId: org.reps[0]?.id ?? "" });
          else if (kind === "team") onChange({ kind, teamId: org.teams[0]?.id ?? "" });
          else if (kind === "queue") onChange({ kind, queueId: org.queues[0]?.id ?? "" });
          else onChange({ kind: "attributes" });
        }}
      >
        <option value="rep">a named rep</option>
        <option value="team">a team</option>
        <option value="queue">a queue</option>
        <option value="attributes">whoever matches attributes</option>
      </select>

      {target.kind === "rep" ? (
        <select
          className={selectClass}
          value={target.repId}
          onChange={(event) => onChange({ kind: "rep", repId: event.target.value })}
        >
          {org.reps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name}
              {rep.active ? "" : " (departed)"}
            </option>
          ))}
        </select>
      ) : null}

      {target.kind === "team" ? (
        <select
          className={selectClass}
          value={target.teamId}
          onChange={(event) => onChange({ kind: "team", teamId: event.target.value })}
        >
          {org.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      ) : null}

      {target.kind === "queue" ? (
        <select
          className={selectClass}
          value={target.queueId}
          onChange={(event) => onChange({ kind: "queue", queueId: event.target.value })}
        >
          {org.queues.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {queue.name}
            </option>
          ))}
        </select>
      ) : null}

      {target.kind === "attributes" ? (
        <span className="font-mono text-[0.6875rem] text-slate">
          territory {target.territory?.join("/") ?? "any"} · languages{" "}
          {target.languages?.join("/") ?? "any"} · specialties{" "}
          {target.specialties?.join("/") ?? "any"}
        </span>
      ) : null}
    </div>
  );
}

export function RuleEditor({
  rule,
  org,
  onChange,
  onClose,
}: {
  rule: Rule;
  org: Org;
  onChange: (next: Rule) => void;
  onClose: () => void;
}) {
  const setCondition = (field: FieldId, constraint: Constraint | undefined) => {
    const when: Record<string, Constraint> = { ...rule.when };
    if (constraint === undefined) delete when[field];
    else when[field] = constraint;
    onChange({ ...rule, when: when as Condition });
  };

  return (
    <div className="border-t border-rule bg-paper/60 px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="rule name">
          <input
            className={`${inputClass} w-80`}
            value={rule.name}
            onChange={(event) => onChange({ ...rule, name: event.target.value })}
          />
        </Field>
        <button
          type="button"
          onClick={onClose}
          className="marking rounded border border-rule-strong px-2 py-1 hover:border-accent hover:text-accent"
        >
          close
        </button>
      </div>

      <p className="marking mt-4">condition — every line must hold</p>
      <div className="mt-1">
        {FIELD_IDS.map((field) => (
          <ConstraintRow
            key={field}
            field={field}
            constraint={rule.when[field]}
            onChange={(constraint) => setCondition(field, constraint)}
          />
        ))}
      </div>

      <p className="marking mt-4">send to</p>
      <div className="mt-1">
        <TargetEditor target={rule.target} org={org} onChange={(target) => onChange({ ...rule, target })} />
      </div>

      <p className="mt-3 text-[0.6875rem] text-slate">
        One constraint per field, joined by <em>and</em>. There is no <em>or</em> inside a rule —
        write two rules. That restriction is what makes the findings proofs.
      </p>
    </div>
  );
}
