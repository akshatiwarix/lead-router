/**
 * Prose to one rule. The model's only job.
 *
 * It never routes, never analyses, never resolves a contest, and never decides
 * where in the list the rule goes — order is the decision procedure and a model
 * has no business setting it. It maps a sentence onto a condition the engine
 * already understands, and the result lands in the builder **disabled**, so a
 * human turns it on after reading it.
 *
 * The response schema is a flat array of uniform constraint objects rather than
 * a discriminated union, because a native `responseSchema` handles unions badly
 * and a malformed union would surface as a confusing Zod error rather than a
 * retry. The mapping to the real `Condition` happens here, and `ruleSchema` is
 * the actual guarantee: a response schema is a request, a validator is a
 * promise.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { ORG } from "@/data";
import {
  COUNTRIES,
  INDUSTRIES,
  LANGUAGES,
  SENIORITIES,
  SOURCES,
  ruleSchema,
  type Condition,
  type Constraint,
  type FieldId,
  type Rule,
} from "@/lib/routing";

const MODEL = "gemini-3.6-flash";

export class MissingKeyError extends Error {}
export class ModelError extends Error {}

const FIELDS: FieldId[] = [
  "country",
  "employees",
  "industry",
  "source",
  "seniority",
  "language",
  "existingCustomer",
  "competitor",
];

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    constraints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING, enum: FIELDS },
          op: {
            type: Type.STRING,
            enum: ["in", "notIn", "between", "is", "missing", "present"],
          },
          values: { type: Type.ARRAY, items: { type: Type.STRING } },
          lo: { type: Type.INTEGER },
          hi: { type: Type.INTEGER },
          bool: { type: Type.BOOLEAN },
        },
        required: ["field", "op"],
      },
    },
    targetKind: { type: Type.STRING, enum: ["rep", "team", "queue"] },
    targetId: { type: Type.STRING },
    note: { type: Type.STRING },
  },
  required: ["name", "constraints", "targetKind", "targetId"],
};

type FlatConstraint = {
  field: FieldId;
  op: "in" | "notIn" | "between" | "is" | "missing" | "present";
  values?: string[];
  lo?: number;
  hi?: number;
  bool?: boolean;
};

function toConstraint(flat: FlatConstraint): Constraint | null {
  switch (flat.op) {
    case "in":
    case "notIn":
      return { kind: flat.op, values: flat.values ?? [] };
    case "between":
      return flat.lo === undefined || flat.hi === undefined
        ? null
        : { kind: "between", lo: flat.lo, hi: flat.hi };
    case "is":
      return flat.bool === undefined ? null : { kind: "is", value: flat.bool };
    case "missing":
      return { kind: "missing" };
    case "present":
      return { kind: "present" };
  }
}

function prompt(description: string): string {
  return `Translate a sentence describing a lead-routing rule into one rule object.

Fields and their allowed values:
- country (enum): ${COUNTRIES.join(", ")} — can be unenriched
- employees (integer 1..500000) — can be unenriched
- industry (enum): ${INDUSTRIES.join(", ")} — can be unenriched
- source (enum): ${SOURCES.join(", ")} — always known
- seniority (enum): ${SENIORITIES.join(", ")} — can be unenriched
- language (enum): ${LANGUAGES.join(", ")} — always known
- existingCustomer (boolean) — always known
- competitor (boolean) — always known

Operators: in, notIn (enum fields); between (employees); is (booleans);
missing (the field has not been enriched yet); present (any enriched value).

Targets:
- team: ${ORG.teams.map((team) => `${team.id} (${team.name})`).join(", ")}
- rep: ${ORG.reps.filter((rep) => rep.active).map((rep) => `${rep.id} (${rep.name})`).join(", ")}
- queue: ${ORG.queues.map((queue) => `${queue.id} (${queue.name})`).join(", ")}

Rules for you:
- At most one constraint per field. There is no OR inside a rule — if the
  sentence needs one, express the closest single condition and say so in note.
- Omit a field entirely rather than constraining it to everything.
- Use only ids and values from the lists above. Never invent one.
- "small" is roughly 1-49 employees, "mid-market" 50-999, "enterprise" 1000+.
  Only use those bounds if the sentence implies a size at all.
- Do not judge whether the rule is a good idea, whether it overlaps anything, or
  where it belongs in the list. The engine decides that.
- note: one short sentence about anything in the sentence you could not express.

Sentence: ${description}`;
}

export type Translation = { rule: Rule; note: string | null };

export async function translate(description: string, ruleId: string): Promise<Translation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new MissingKeyError("GEMINI_API_KEY is not set");
  }

  const client = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt(description),
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0,
      },
    });
    text = response.text;
  } catch (error) {
    throw new ModelError(error instanceof Error ? error.message : "model call failed");
  }

  if (text === undefined) throw new ModelError("the model returned no text");

  let parsed: {
    name?: string;
    constraints?: FlatConstraint[];
    targetKind?: string;
    targetId?: string;
    note?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ModelError("the model returned text that is not JSON");
  }

  const when: Record<string, Constraint> = {};
  for (const flat of parsed.constraints ?? []) {
    const constraint = toConstraint(flat);
    if (constraint === null) continue;
    when[flat.field] = constraint;
  }

  const target =
    parsed.targetKind === "rep"
      ? { kind: "rep" as const, repId: parsed.targetId ?? "" }
      : parsed.targetKind === "queue"
        ? { kind: "queue" as const, queueId: parsed.targetId ?? "" }
        : { kind: "team" as const, teamId: parsed.targetId ?? "" };

  // A response schema is a request. A validator is a guarantee.
  const result = ruleSchema.safeParse({
    id: ruleId,
    name: parsed.name ?? description.slice(0, 60),
    when: when as Condition,
    target,
    // Unrun, always. The model proposes; a person decides.
    enabled: false,
  });

  if (!result.success) {
    const first = result.error.issues[0];
    throw new ModelError(
      first ? `${first.path.join(".") || "(root)"} — ${first.message}` : "invalid rule",
    );
  }

  return { rule: result.data, note: parsed.note?.trim() || null };
}
