"use client";

/**
 * Prose in, one rule out — disabled, at the bottom of the list, waiting to be
 * read.
 *
 * The model does not decide where the rule goes, because order is the decision
 * procedure. It does not decide whether the rule is a good idea, because that
 * is what the findings panel is for. And nothing here is required: with no API
 * key this box returns a 501 that points at the editor, and every other feature
 * in the product is unaffected.
 */

import { useState } from "react";
import type { Rule } from "@/lib/routing";
import { inputClass } from "./ui";

export function TranslatePanel({ onRule }: { onRule: (rule: Rule) => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          ruleId: `rl-drafted-${description.replace(/[^a-z0-9]+/gi, "").slice(0, 12).toLowerCase() || "rule"}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "Translation failed.");
        return;
      }
      onRule(body.rule as Rule);
      setMessage(
        body.note
          ? `Added, switched off, at the bottom of the list. The model noted: ${body.note}`
          : "Added, switched off, at the bottom of the list. Read it, then turn it on.",
      );
      setDescription("");
    } catch {
      setMessage("Translation failed.");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="marking rounded border border-rule-strong px-2 py-1 hover:border-accent hover:!text-accent"
      >
        describe a rule
      </button>
    );
  }

  return (
    <div className="w-96 rounded border border-rule-strong bg-paper p-2">
      <div className="flex gap-1.5">
        <input
          className={`${inputClass} min-w-0 flex-1`}
          placeholder="small healthcare and government leads go to the AMER team"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && description.length > 2 && !pending) void submit();
          }}
        />
        <button
          type="button"
          disabled={pending || description.length < 3}
          onClick={() => void submit()}
          className="marking rounded border border-rule-strong bg-card px-2 py-1 disabled:opacity-40 hover:enabled:border-accent hover:enabled:!text-accent"
        >
          {pending ? "…" : "add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessage(null);
          }}
          className="marking rounded border border-rule-strong bg-card px-2 py-1 hover:border-accent hover:!text-accent"
        >
          ×
        </button>
      </div>
      {message ? <p className="mt-1.5 text-[0.6875rem] leading-snug text-slate">{message}</p> : null}
    </div>
  );
}
