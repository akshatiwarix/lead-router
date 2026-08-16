/**
 * Shared primitives.
 *
 * The one that carries meaning is `FindingBadge`: proofs and observations are
 * given different borders as well as different colours, because the difference
 * between them is the thing the product exists to defend and a reader should be
 * able to see it in a greyscale screenshot.
 */

import type { ReactNode } from "react";
import type { Severity } from "@/lib/routing";

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-rule bg-card shadow-[0_1px_2px_rgba(23,24,28,0.04)] ${className}`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h2 className="marking !text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = {
  BROKEN: "text-dead bg-dead-soft border-dead/30",
  SUSPECT: "text-contested bg-contested-soft border-contested/30",
  NOTE: "text-slate bg-paper border-rule-strong",
};

export function FindingBadge({
  kind,
  severity,
  epistemic,
  onClick,
  active = false,
}: {
  kind: string;
  severity: Severity;
  epistemic: "PROOF" | "OBSERVATION";
  onClick?: () => void;
  active?: boolean;
}) {
  // Solid edge for a proof, dashed for an observation. Never the same border.
  const edge = epistemic === "PROOF" ? "border-solid" : "border-dashed";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={`marking !text-[0.625rem] rounded border ${edge} ${SEVERITY_STYLE[severity]} px-1.5 py-0.5 ${
        onClick ? "cursor-pointer hover:brightness-95" : ""
      } ${active ? "ring-1 ring-accent ring-offset-1" : ""}`}
    >
      {kind.replaceAll("_", " ")}
    </Tag>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "proof" | "observation" | "dead" | "blocked" | "covered";
}) {
  const tones = {
    neutral: "bg-paper text-slate border-rule-strong",
    proof: "bg-proof-soft text-proof border-proof/25",
    observation: "bg-observation-soft text-observation border-observation/25",
    dead: "bg-dead-soft text-dead border-dead/25",
    blocked: "bg-blocked-soft text-blocked border-blocked/25",
    covered: "bg-covered-soft text-covered border-covered/25",
  } as const;
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[0.6875rem] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="marking">{label}</span>
      {children}
    </label>
  );
}

export const selectClass =
  "rounded border border-rule-strong bg-card px-2 py-1 font-mono text-xs text-ink focus:border-accent focus:outline-none";

export const inputClass = selectClass;

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-slate">{children}</p>;
}
