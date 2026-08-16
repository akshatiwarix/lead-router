# Day 009 — Lead Router — Implementation Plan

Day 009 of a 100-day building challenge. The concept is fixed by the master backlog
(`~/Desktop/100-days-portfolio-execution-plan.md`): *a rules-driven system for assigning leads or
accounts to the right owner.* Every choice below came out of a decision-by-decision interview
across three rounds and is deliberate rather than a default. The 26 settled decisions are recorded
at the bottom; treat them as decided, not as open questions to relitigate.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

Every B2B company routes inbound leads with an ordered list of rules. It lives in a Salesforce
assignment ruleset, a HubSpot workflow, a Chili Piper config, or three hundred lines of Zapier. It
is a **program** — branching control flow over typed inputs, with a fallthrough default — and it is
the only program in the company that ships with no tests, no coverage report, no linter, and no
review. It is edited under pressure by whoever is on the ops rotation that quarter, and it is never
deleted from, only appended to.

Four things go wrong inside that list, and this repo exists because of them.

**Rules die silently.** Somebody adds a broad rule near the top in month three — *all EMEA leads to
the EMEA team*. In month nine somebody adds a narrow rule near the bottom — *French enterprise
leads to Marie*. Marie's rule never fires. Not once. It sits in the config looking authoritative,
it gets quoted in QBRs, and there is no output anywhere in the system that distinguishes a rule
that fires from a rule that cannot fire. Nobody finds out until Marie asks why she has no leads.

**The ruleset has holes and nobody knows their shape.** Some region of lead-space is claimed by no
rule and falls to the catch-all queue. Everyone knows the catch-all exists; nobody can say what is
in it. "Leads we didn't plan for" is not a description you can act on. The question *which
combinations of country, size, industry and source does my ruleset not handle* has a precise
answer, and no routing tool in the market computes it.

**Overlap is resolved by accident.** Two rules match the same lead and disagree about the owner.
Whichever one happens to be higher in the list wins, and the ordering was decided by the order
people happened to add them. That is not a routing decision; that is a merge conflict resolved by
line number, executed thousands of times a month, invisibly.

**Assignment is confused with eligibility.** Routing tools present one answer — *this lead went to
Dana* — and hide the fact that two separate mechanisms produced it. One is deterministic: the rules
narrowed the lead to a set of eligible owners. The other is stateful: a round-robin counter picked
Dana out of that set. Run the same lead through again and you get Priya. Every vendor demo shows
the assignment as though it were a function of the lead. For most configurations it is not, and
nothing on screen says so.

So the interesting problems are:

- Can a routing ruleset be **statically analysed** — dead rules, uncovered regions, contested
  leads, contradictory conditions — with **exact** answers rather than sampled guesses?
- What has to be **given up in the rule language** to make that possible, and is the trade worth it?
- Can the **deterministic** half of routing be separated from the **stateful** half cleanly enough
  that the analysis is honest about which is which?
- Can a rule edit report its own **blast radius** before it ships?

### What this repo is not

Four sibling days own the neighbouring problems and this one does not build any of them.

- **Day 016 `territory-builder`** owns drawing territories. Here territories are *input data* — a
  rep record has a country list, and where that list came from is not this repo's question.
- **Day 029 `lead-sla-monitor`** owns the clock. No timers, no reassignment-after-N-hours, no
  working hours, no PTO, no speed-to-lead measurement. **There is no clock in this repo at all.**
- **Day 033 `routing-simulator`** owns volume over time. No "push 500 leads through and watch the
  queues fill", no load charts, no starvation analysis. The corpus is a fixed set evaluated once.
- **Day 001 `icp-score`** owns weighted arithmetic. **No score.** No 0–100, no fit percentage, no
  "routing health: 73%". Findings are typed and counted, never summed into a number.
- **Day 012 `icp-diff`** owns definition-vs-definition comparison. Blast radius here is framed as
  *this edit, right now, moved these leads* — an attribute of an in-progress change, not a
  side-by-side compare view.

---

## Intended user

A RevOps or sales-ops person who owns lead routing and has inherited a ruleset they did not write.
Their working questions are:

- Which of these 19 rules actually fire? Which can I delete?
- What is in the catch-all queue, described as a *shape* rather than as a pile?
- Two teams both think they own French mid-market. Which one actually gets it?
- I want to add a rule for the new partner motion. What breaks?

Secondary user: the hiring manager reading the repo, who should see that the interesting part is
the region algebra in `lib/routing/`, not the UI.

---

## User journey

1. Land on the console. A default ruleset — 19 rules, ordered — is loaded and already analysed.
   Three rules carry red badges before the user does anything.
2. Read the findings pane. It is split into two sections that never mix: **Proofs** (true of the
   whole lead-space, computed) and **Observations** (true of these 70 corpus leads, counted).
3. Click the dead rule. The space map highlights its region and shows it entirely covered by the
   two rules above it. The rule is not merely unused; it is unusable.
4. Open the space map. Pick `country` and `employees` as axes. A block of cells is grey — no rule
   claims it. Read the region description: *industry ∈ {healthcare, government}, employees ∈
   [1, 49], any country*. Eleven corpus leads live there.
5. Write a rule to cover it — either in the builder, or by typing *"small healthcare and government
   leads go to the SMB team"* and letting the model translate it into a rule object that lands
   **unrun and editable**.
6. Enable it. The findings re-derive with no round trip. The hole closes; a new `CONTESTED` finding
   appears against an existing rule. The blast-radius strip says *this edit moved 11 leads*, and
   lists them.
7. Switch the selection strategy from `FIRST_ELIGIBLE` to `ROUND_ROBIN`. The leads pane relabels
   itself **not reproducible** and the assignments change while every finding stays identical —
   because selection cannot affect what the analyser proves.
8. Export the assignment CSV, or copy the ruleset permalink.

---

## MVP scope

**In:**

- A restricted, decidable rule language over declared field domains (see *Data model*).
- Exact region algebra by cut-point grid decomposition — no solver, no sampling.
- Eight static findings, proven over the whole lead-space.
- Three empirical findings, counted over the corpus.
- Account-ownership pre-emption as a distinct stage that runs before the ruleset.
- Eligibility (pure) / selection (stateful) split, with three selection strategies.
- Blast radius of an edit against the working ruleset.
- Space map: 2-D projection of the cell grid with explicit pinned slice.
- Editable ruleset in the browser; the engine ships to the client.
- Corpus: ~12 reps, ~25 accounts, ~70 leads, 19-rule default ruleset, 4 preset rulesets.
- Six named traps, each with a test named after it.
- Gemini prose → rule object, landing unrun.
- CSV export, ruleset permalink.

**Out (explicitly — as binding as the In list):**

- Any notion of time: SLAs, timers, reassignment, business hours, PTO, speed-to-lead.
- Volume simulation, queue depth, load charts, starvation analysis.
- Territory construction. Territories are input fields on a rep.
- Any score, percentage-of-health, or summed metric.
- CRM integration, webhooks, inbound API, persistence, auth, multi-user.
- Rule versioning, approval workflows, audit history beyond the current edit.
- Arbitrary expressions: regex, cross-field comparison (`a > b`), arithmetic, nested boolean.
- Routing accounts (as opposed to leads) as a separate mode.

---

## Stack

Unchanged from Days 001–008, so a reviewer types the same commands in every repo.

- Next 16 (App Router), React 19, TypeScript `strict` + `noUncheckedIndexedAccess`.
- Tailwind v4 via `@tailwindcss/postcss`.
- Zod v4 as the trust boundary on all data and all model output.
- Vitest, config in `vitest.config.mts`, globbing `lib/**/*.test.ts` only.
- `vite-node -c vitest.config.mts` for scripts.
- `@google/genai`, `gemini-3.6-flash`, optional.
- npm as the committed package manager. Vercel as the deploy target. MIT.

`lib/routing/` is **dependency-free and framework-free** — it imports `zod` and nothing else. Not
`next`, not `react`, not `@/data`, no DOM globals. An eslint `no-restricted-imports` rule scoped to
the directory enforces it, and the package carries its own `README.md`. This is not stylistic: an
analyser that cannot reach a network client or a database cannot produce a finding that isn't a
consequence of its arguments.

---

## APIs / data sources

- **Primary: an authored synthetic corpus.** Reps, accounts, leads and rulesets are hand-written
  and Zod-validated at import. Every domain ends in `.example`. No real company, no real person.
  The corpus is authored *around the traps* — it exists to make specific pathologies demonstrable.
- **Optional: Gemini**, one job only — natural language → a `Rule` object matching the response
  schema, Zod-validated, landing in the builder **unrun and editable**. The model never routes,
  never analyses, never resolves a contest. `GEMINI_API_KEY` unset → **501** with a message
  pointing at the builder; model failure → **502**. Every feature in the *In* list must work with
  the key unset.
- No other network calls. No CRM, no enrichment provider, no third-party routing API.

---

## System / architecture

```
                    ┌─ server component ──► data/*.ts (Zod-validated at import)
Browser ────────────┤
                    ├─ lib/routing (pure) ──► same functions client- and server-side
                    │
                    └─ POST /api/translate ──► key check ──► rate limit ──► model ──► Zod ──► Rule (unrun)
```

The engine ships to the browser. Editing a rule must re-derive every finding and every assignment
without a round trip; nothing about the analysis requires a server.

**Pipeline, in order:**

```
lead
 │
 ├─ 1. PRE-EMPTION   emailDomain → account → active owner?    ──► PREEMPTED  (stop)
 │                                          → inactive owner? ──► BLOCKED    (stop)
 │
 ├─ 2. MATCHING      evaluate ALL rules  → full match set     (analysis)
 │                   first enabled match → winning rule       (decision)
 │
 ├─ 3. ELIGIBILITY   winning rule.target → eligible rep set   (pure, analysable)
 │                                        empty?             ──► BLOCKED
 │
 ├─ 4. SELECTION     strategy + capacity → one rep            (stateful, NOT analysable)
 │
 └─ (no rule matched)                                        ──► FALLBACK (default queue)
```

Steps 1–3 are a pure function of `(lead, ruleset, reps, accounts)`. Step 4 is the only place state
enters, and it is the only place the same input can produce two different answers. Everything the
analyser claims is a claim about steps 1–3. Capacity caps live in step 4 and therefore **cannot**
change a single finding — this is asserted in the sweep.

### Modules

| module | responsibility |
|---|---|
| `types.ts` | the type contract — fields, domains, conditions, rules, targets, outcomes, findings |
| `domains.ts` | the eight declared field domains; the only place a field's universe is stated |
| `schema.ts` | Zod schemas for corpus and ruleset; parsed at import, throws on bad data |
| `condition.ts` | constraint algebra — intersect, subset, complement, isEmpty, per field |
| `grid.ts` | cut-point decomposition, cells, region union/difference, region → prose |
| `route.ts` | the pipeline, steps 1–3; pure |
| `select.ts` | step 4 — three strategies, capacity; the only stateful module |
| `analyze.ts` | the eight static findings, over the grid |
| `empirical.ts` | the three corpus findings, over corpus leads |
| `diff.ts` | blast radius — assignments under ruleset A vs ruleset B |
| `export.ts` | CSV serialisation, permalink encode/decode |
| `index.ts` | public surface |

---

## Data model

### Field domains

Eight lead fields. Each declares a finite or interval domain in `domains.ts`. **This is the only
place a domain is written down**, and the exactness of the whole analysis rests on it being
complete.

| field | kind | domain |
|---|---|---|
| `country` | enum | `FR DE UK ES IT US CA BR IN JP AU SG` + `⊥` |
| `employees` | int interval | `[1, 500000]` + `⊥` |
| `industry` | enum | `saas fintech healthcare ecommerce manufacturing education government nonprofit other` + `⊥` |
| `source` | enum | `demo_request content_download webinar free_trial partner_referral outbound_reply event chat` |
| `seniority` | enum | `c_level vp director manager ic other` + `⊥` |
| `language` | enum | `en fr de es pt ja` |
| `existingCustomer` | boolean | `true false` |
| `competitor` | boolean | `true false` |

**`⊥` is a value in the domain, not a third truth value.** It means the field was not enriched at
the time of routing. A constraint admits `⊥` only if written to; a rule keyed on an unenriched
field simply does not match. This keeps all logic two-valued and every operation exact, while still
making the real failure — *this rule can only fire on leads that have already been enriched* —
a first-class finding rather than a footnote.

`source`, `language`, `existingCustomer` and `competitor` have no `⊥`: they are known at capture.

### Condition

A rule condition is a **conjunction of at most one constraint per field**. An omitted field is
unconstrained (the full domain). There is no disjunction inside a rule — write two rules. There is
no cross-field comparison, no arithmetic, no regex.

```ts
type Constraint =
  | { kind: "enum"; values: string[] }        // membership; negation is the complement, still a set
  | { kind: "interval"; lo: number; hi: number }
  | { kind: "bool"; value: boolean }
  | { kind: "absent" }                         // matches ⊥ only
  | { kind: "present" }                        // matches everything except ⊥

type Condition = Partial<Record<FieldId, Constraint>>
```

Each condition is therefore a **hyperrectangle** in the product of the eight domains. Closure under
intersection and complement-within-a-field is what makes everything below exact.

### The grid

Collect every boundary value that appears anywhere in the ruleset — every enum member named, every
interval endpoint, every `⊥`. Each field's domain partitions into finitely many **cells** at those
cut points. The whole lead-space becomes a finite grid, and **every rule is exactly a union of
cells**. Overlap, subsumption, shadowing, uncovered region: exact set operations on cells. No
solver, no sampling, no approximation.

The trade is stated openly in the README: *this rule language is weaker than Salesforce's on
purpose, and that weakness is what makes the answers proofs.*

### Rule

```ts
type Rule = {
  id: string
  name: string
  when: Condition
  target: Target
  enabled: boolean
}

type Target =
  | { kind: "rep"; repId: string }
  | { kind: "team"; teamId: string }
  | { kind: "queue"; queueId: string }         // partner queue, DO_NOT_ROUTE
  | { kind: "attributes"; territory?: Country[]; languages?: Language[]; specialties?: Industry[] }
```

A target resolves to a **set** of eligible reps, never directly to a person. That is what makes
`NO_ELIGIBLE_OWNER` computable and what keeps step 3 separate from step 4.

### Rep, account, queue

```ts
type Rep = {
  id; name; teamId
  territory: Country[]
  languages: Language[]
  specialties: Industry[]
  capacity: number          // selection-stage only
  active: boolean           // false = departed
}

type Account = { domain: string; name: string; ownerId: string | null }
type Lead    = { id; name; emailDomain; ...the eight fields }
```

### Outcomes

```
PREEMPTED  — account already owned by an active rep; rules never ran
BLOCKED    — resolved to an empty eligible set (departed pre-emption owner, or an empty target)
ROUTED     — a rule matched and a rep was selected
SUPPRESSED — routed to DO_NOT_ROUTE
FALLBACK   — no rule matched; default queue
```

`BLOCKED` is deliberately not made to fall through to the rules. A pre-emption pointing at a
departed rep is a black hole, and a system that quietly papers over it is how the black hole
survives for two years. Surfacing it is the point. The README notes that a production system needs
a declared fallback policy here, and that choosing one is out of scope for a one-day build.

---

## Findings

Split by epistemic class and **rendered in separate sections that are never summed together**. A
statement about the lead-space is a proof; a statement about 70 authored leads is an observation.
Conflating them is exactly the mistake the repo is about.

### Static findings — proofs over the whole space

| finding | meaning |
|---|---|
| `UNSATISFIABLE` | the condition's region is empty before any shadowing — contradictory constraints |
| `UNREACHABLE` | region fully covered by higher-priority enabled rules; can never win |
| `PARTIALLY_SHADOWED` | region partly eaten; the surviving region is described |
| `REDUNDANT` | the rule wins somewhere, but deleting it changes no assignment anywhere |
| `CONTESTED` | ≥2 rules match a shared region and resolve to different owner sets; order alone decides |
| `UNCOVERED` | cells claimed by no enabled rule; enumerated as described regions |
| `ENRICHMENT_DEPENDENT` | the region excludes `⊥` on some field, so the rule cannot fire pre-enrichment |
| `NO_ELIGIBLE_OWNER` | the rule can win, but its target resolves to zero active reps |

### Empirical findings — observations over the corpus

| finding | meaning |
|---|---|
| `UNCOVERED_IN_PRACTICE` | how many corpus leads land in each uncovered region |
| `CONTESTED_IN_PRACTICE` | which corpus leads actually hit a contested region |
| `PRE_EMPTED_IN_PRACTICE` | rule is reachable in the space, but every corpus lead in its region is pre-empted first |

### The number that is never reported

**No "% of lead-space".** Cell count is not lead volume; reporting a percentage would assume a
uniform distribution over leads, which is false, and it is precisely how this repo would turn back
into Day 001's score. An uncovered region gets a **description** and a **corpus lead count**.
Nothing else.

---

## The corpus and the six named traps

~12 reps across 3 teams, ~25 accounts, ~70 leads, a 19-rule default ruleset, 4 preset rulesets
(one per pathology). Each trap has a test named after it in `traps.test.ts`.

1. **The dead rule** — a narrow rule (`FR` + enterprise) added below a broad one (`EMEA`). Fires
   never. → `UNREACHABLE`.
2. **The enrichment gap** — a rule keyed on `employees` in a ruleset where a third of leads arrive
   with `employees = ⊥`. → `ENRICHMENT_DEPENDENT`.
3. **The silent contest** — the partner-referral rule and the enterprise rule both claim
   partner-sourced enterprise leads and disagree. Line order decides. → `CONTESTED`.
4. **The hole** — small healthcare and government leads are claimed by no rule and fall to the
   catch-all. Eleven corpus leads. → `UNCOVERED` + `UNCOVERED_IN_PRACTICE`.
5. **The departed owner** — an account whose owner has `active: false`; pre-emption resolves to a
   ghost. → `BLOCKED`.
6. **The vanity rule** — reachable, fires, but every assignment it makes is identical to what the
   next rule would have made. → `REDUNDANT`.

---

## Main states and workflows

- **Ruleset states:** clean · has proofs · has observations · edited-since-load (blast radius live).
- **Rule states:** enabled/disabled × the eight static findings (a rule may carry several).
- **Lead states:** the five outcomes, each with a trace — pre-emption result, full match set,
  winning rule, eligible set, selected rep, strategy.
- **Selection states:** `FIRST_ELIGIBLE` (reproducible) · `ROUND_ROBIN` · `LEAST_LOADED` (both
  labelled **not reproducible** in the UI).
- **Model states:** no key → 501 → pointer at the builder · failure → 502 · success → rule lands
  unrun, in the builder, editable, disabled by default.

### Console layout

Four panes, one page.

- **Ruleset** — ordered, drag to reorder, per-rule finding badges, enable/disable, inline editor.
- **Space map** — two axis pickers over the eight fields, remaining six pinned to stated values,
  cells coloured covered / uncovered / contested, hover shows the winning rule. The pinned slice is
  printed above the map: a 2-D view of an 8-D space is a projection and the UI says so.
- **Findings** — Proofs and Observations, separate sections, separate counts.
- **Leads** — 70 rows; owner, outcome, winning rule; expand for the full trace.

Plus a blast-radius strip that appears only when the working ruleset differs from the loaded one.

---

## Implementation task order

One commit per step, pushed to `main` immediately.

1. `PLAN.md`, `LICENSE`, `.gitignore`, repo created, first push.
2. Next 16 scaffold, Tailwind v4, `tsconfig.json`, `vitest.config.mts`, eslint boundary rule,
   `package.json` scripts.
3. `lib/routing/types.ts`, `domains.ts`, `schema.ts`.
4. `condition.ts` + `condition.test.ts` — constraint algebra.
5. `grid.ts` + `grid.test.ts` — cut points, cells, region union/difference, region → prose.
6. `data/` — reps, accounts, leads, default ruleset, presets; Zod-validated at import.
7. `route.ts` + `select.ts` + tests — pipeline and the three strategies.
8. `analyze.ts` + `analyze.test.ts` — the eight static findings.
9. `empirical.ts`, `diff.ts` + tests — corpus findings and blast radius.
10. `traps.test.ts` (six named tests) + `scripts/sweep.mts` (invariant sweep).
11. `export.ts` + tests — CSV, permalink encode/decode.
12. App shell, layout, Ruleset pane.
13. Space map.
14. Findings pane.
15. Leads pane with trace.
16. `/api/translate` — Gemini, rate limit, Zod, unrun landing.
17. `lib/routing/README.md`, root `README.md`, screenshots, demo GIF, deploy.

---

## Validation / test plan

Unit tests per module, plus one test named after each of the six traps, plus an invariant sweep
that brute-forces the analyser's claims against the corpus. The sweep is the important one: it
checks that the *proofs are actually true*, not that the code runs.

Sweep invariants:

- **Partition.** Every corpus lead maps to exactly one cell. Cells are disjoint and cover the space.
- **Completeness.** Union of enabled rule regions ∪ uncovered region = the whole space.
- **Eligibility is a function.** Same `(lead, ruleset)` → same eligible set, 100 iterations.
- **`UNREACHABLE` is sound.** Disabling any rule flagged `UNREACHABLE` changes **zero** assignments
  across all 70 leads. If it changes one, the analyser is wrong.
- **`REDUNDANT` is sound.** Same, for every rule flagged `REDUNDANT`.
- **`UNREACHABLE`/`REDUNDANT` are complete enough.** Disabling any rule flagged with neither
  changes **at least one** assignment.
- **Capacity cannot move a finding.** Set every rep's capacity to 0, then to 10000; the finding set
  is byte-identical both times.
- **Selection is quarantined.** `FIRST_ELIGIBLE` is stable across runs; `ROUND_ROBIN` demonstrably
  is not — asserted, so the "not reproducible" label is backed by a test rather than a claim.
- **Blast radius is exact.** `diff(A, B)` lists exactly the leads whose assignment differs when
  both rulesets are routed independently.

Manual verification: the full user journey above, and the failure states — no API key, model
failure, empty ruleset, all-rules-disabled, a ruleset with a hole covering the entire space.

---

## Deployment plan

Vercel, `akshatiwarix/lead-router`, public. `GEMINI_API_KEY` as the only environment variable, and
the deploy must be verified to work with it unset before it is set. `npm run build`, `npm test`,
`npm run typecheck`, `npm run lint`, `npm run sweep` all green before deploy is claimed.

## README plan

The structure mandated by the master backlog. The sections that carry weight here:

- **How It Works** — the pipeline diagram, and the cut-point grid explained in plain English.
- **Key Decisions & Tradeoffs** — the restricted rule language (what it cannot express, and why
  that is the point), proofs vs observations, no percentage-of-space, `BLOCKED` not falling through.
- **Limitations** — no clock, no simulation, single-user, synthetic corpus, eight fields.
- Plus the plain-English guide (`docs/plain-english-guide.md`) and printed handout, matching Days
  001–008, and screenshots plus a demo GIF from the live deployment.

## Definition of done

- All five commands green: `build`, `test`, `typecheck`, `lint`, `sweep`.
- All eight static findings and all three empirical findings reachable in the shipped corpus.
- All five outcomes reachable.
- All six traps demonstrated on screen and covered by a test named after them.
- The app fully functional with `GEMINI_API_KEY` unset.
- Deployed, screenshotted, README and plain-English guide written.
- Every task committed and pushed to `main` as it landed.

## Post-MVP (not in this build)

- More field kinds — dates, hierarchical enums, set-valued fields.
- A second analysis pass over *sequences* of edits rather than one edit.
- Import from a Salesforce assignment ruleset export, with an explicit report of which real rules
  fall outside the decidable fragment.
- Explaining a contest by proposing the minimal condition edit that resolves it.

---

## Settled decisions

1. Thesis: a routing ruleset is a program; this repo statically analyses it and proves what fires,
   what cannot, what is contested, and what is uncovered.
2. Out: no clock (Day 029), no volume simulation (Day 033), no territory drawing (Day 016), no
   score (Day 001), no A/B definition compare (Day 012).
3. Leads are routed. Account ownership is a distinct **pre-emption stage** ahead of the ruleset.
4. Eligibility (pure, analysable) is split from selection (stateful, not analysable).
5. LLM: one job — prose → `Rule`. Never routes, never analyses. Lands unrun.
6. Stack unchanged from Days 001–008. One day, feature-frozen at sign-off, commit-per-task.
7. Restricted rule language: conjunction of per-field constraints over declared domains. No
   disjunction-in-rule, no cross-field comparison, no arithmetic, no regex.
8. Exactness by cut-point grid decomposition. No SMT solver, no sampling.
9. `⊥` (missing) is a domain value, not a third truth value. Logic stays two-valued.
10. Ordered first-match-wins for the **decision**; full match set computed for the **analysis**.
11. Ruleset is editable in-browser; the engine ships to the client; permalink-encoded.
12. Blast radius is in, framed as an in-progress edit, not a compare view.
13. Corpus: ~12 reps, ~25 accounts, ~70 leads, 19-rule default, 4 presets, all `.example`.
14. Eight lead fields with declared domains, listed in `domains.ts` and nowhere else.
15. Targets resolve to rep **sets**, never to a person, so `NO_ELIGIBLE_OWNER` is computable.
16. Eight static findings (proofs) and three empirical findings (observations), never mixed.
17. Never report "% of lead-space" — cell count is not lead volume.
18. Three selection strategies; the two stateful ones are labelled not reproducible in the UI.
19. Capacity lives on the selection side and cannot affect any finding; the sweep asserts it.
20. `BLOCKED` does not fall through to the rules. Surfacing the black hole is the point.
21. Space map is the hero visual; the pinned slice of the projection is always printed.
22. Console layout: Ruleset · Space map · Findings · Leads, one page.
23. Six named traps, each with a test named after it.
24. Sweep brute-forces the analyser's soundness against the corpus, including capacity invariance.
25. `lib/routing/` dependency-free and framework-free, enforced by lint, with its own README.
26. Repo `akshatiwarix/lead-router`, public, MIT, pushed to `main` per task.
