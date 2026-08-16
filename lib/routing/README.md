# `lib/routing`

The engine. It imports `zod` and nothing else — not `next`, not `react`, not the
corpus in `@/data`, no host globals, no clock, no randomness. `purity.test.ts`
reads this directory off disk and enforces that; the eslint rule is a
convenience on top of it.

That constraint is load-bearing rather than tidy. An analyser that cannot reach
a network client, a database or a clock cannot produce a finding that is not a
consequence of its arguments — which is what entitles the console to render the
output as **proofs**.

## The idea in one page

A routing ruleset is an ordered list of rules; first enabled match wins. The
questions worth asking about one are all the same shape: *which leads does rule
14 win, given that rules 1–13 ran first?* Over an unrestricted expression
language that needs an SMT solver and still comes back approximate.

So the language is restricted until the question is arithmetic. A rule condition
is a conjunction of **at most one constraint per field** over eight declared
domains. No disjunction inside a rule (write two rules), no cross-field
comparison, no arithmetic, no regex.

Every condition therefore names a finite set of boundaries. Cut each field's
domain at exactly those boundaries and you get a small number of **atoms** per
field with one useful property: no condition in that ruleset can split one. So
every rule is exactly a union of atoms — a hyperrectangle over atom indices —
and shadowing, coverage and contest become intersection and difference.

```
country     │ FR │ DE │ UK │ ES │ … │ ⊥ │        ← one atom per value, plus unenriched
employees   │ 1–49 │ 50–199 │ 200–999 │ 1000–500k │ ⊥ │   ← cut where the rules cut
                    ▲        ▲
                    │        └── because rl-uk-upper-mid says [200, 999]
                    └── because rl-emea-mid says [50, 999]
```

Regions are kept as unions of boxes, not enumerated cells: the full cell count
across eight fields runs to seven figures, while a real ruleset's box count
stays in the dozens.

## What is deliberately given up

This language cannot express things Salesforce can — `annual_revenue >
employees * 50_000`, a regex on the email domain, `(A and B) or C` inside one
rule. That is the trade, and it is the point: the weakness is what makes the
answers proofs instead of guesses. A version of this tool with a richer language
would have to say "probably unreachable", and a probably-unreachable rule is not
worth reporting.

## Missing values

`⊥` is a **value in the domain**, not a third truth value. A constraint admits it
only if written to (`{ kind: "missing" }`), so a rule keyed on an unenriched
field simply does not match. Logic stays two-valued, every set operation stays
exact, and the real-world failure — *this rule cannot fire until enrichment
lands* — is reported as `ENRICHMENT_DEPENDENT` rather than smeared across the
whole algebra.

Note the consequence for `notIn`: it excludes `⊥` too. `industry notIn
{healthcare}` does **not** match a lead whose industry has not resolved. That is
what real routing does, and it is where holes come from.

## The seam

```
routePure   steps 1–3   pre-emption → matching → eligibility     pure
createSelector  step 4  strategy + capacity → one rep            stateful
```

Steps 1–3 are a pure function of `(lead, ruleset, org)`. Everything `analyze.ts`
claims is a claim about them. Step 4 is where the same lead can produce two
different answers, so it is one module, it declares `reproducible`, and
`select.test.ts` proves the declaration by asking the identical question four
times.

Capacity lives on the stateful side and is deliberately soft — a full team still
receives the lead rather than blocking it — because letting a load figure
produce an outcome would let it change what the analyser proves. The sweep
asserts findings are byte-identical at capacity 0 and capacity 10,000.

## Findings, and the line between them

`analyze.ts` returns **proofs**: true of the whole lead-space, computed.
`empirical.ts` returns **observations**: true of the leads you handed it,
counted. They are never merged, never summed, and never rendered in the same
section. *"Eleven of your leads fell into a hole"* is disprovable by next week's
traffic; *"your ruleset has a hole"* is a property of the artifact.

Neither ever reports a percentage of lead-space. Atom count is not lead volume,
and a proportion would assume a uniform distribution over leads that no funnel
has ever had.

Three suppressions are worth knowing about, because each one is a judgement
rather than a bug:

- A rule above that **strictly refines** this one is deliberate. France-above-EMEA
  and a trailing catch-all are idioms. Only a *partial* overlap, where neither
  rule refines the other, is a decision nobody made.
- A rule above that constrains **no field this rule mentions** is a guard.
  "Competitors never reach a rep" narrows every rule in the list without any of
  their authors having thought about competitors.
- A rule targeting a **queue** is not claiming ownership; it is removing the lead
  from the ownership question. It cannot contest.

Without those, the shipped nineteen-rule corpus produces thirty-six contests and
a shadow note on nearly every rule — all true, all noise, and noise teaches the
reader to ignore the panel.

## Module map

| module | responsibility |
|---|---|
| `types.ts` | the type contract |
| `domains.ts` | the eight field domains — the only place a universe is declared |
| `schema.ts` | Zod; malformed rules die here, unsatisfiable ones pass through to be reported |
| `condition.ts` | one constraint, read two ways: does a lead match, which atoms are covered |
| `grid.ts` | cut points, boxes, region algebra, region → prose |
| `route.ts` | steps 1–3; pure |
| `select.ts` | step 4; the only stateful module |
| `analyze.ts` | eight static findings |
| `empirical.ts` | three corpus findings |
| `diff.ts` | blast radius of an edit |
| `export.ts` | CSV and permalink |

## Testing

```bash
npm test                                   # unit tests, traps, purity
npm run sweep                              # 667 invariants, brute-forced against the corpus
npx vitest run -t "trap: the dead rule"    # one named trap
```

The sweep is the one that matters. It deletes every rule the analyser called
dead or redundant and checks that nobody moves — the analyser checked against
brute force rather than against itself.
