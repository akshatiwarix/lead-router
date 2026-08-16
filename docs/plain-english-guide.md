# Lead Router — how it works, in plain English

No code in this document. It explains what the tool does, what the two kinds of answer mean, and why it refuses to give you a score.

---

## The problem

Your company decides who gets each inbound lead using a list of rules, read top to bottom, first match wins.

> 1. Competitors → nowhere
> 2. Existing customers → the CS queue
> 3. Partner referrals → Tom
> 4. Anything C-level → Enterprise
> 5. 1,000+ employees → Enterprise
> 6. Healthcare and government, 50–999 → Dana
> …

That list is a piece of software. It has branches, it has a default case, and it runs thousands of times a month. It is also the only piece of software at your company that nobody tests, nobody reviews, and nobody ever deletes from — only adds to.

Four things go wrong inside it, and all four are invisible.

### 1. Rules die, and nothing tells you

In month three somebody adds *1,000+ employees → Enterprise*. In month nine somebody adds *French companies with 1,000+ employees → Noor*.

Noor's rule will never fire. Not once, ever. Every lead it describes was already taken four lines above it.

Nothing in any routing tool distinguishes a rule that fires from a rule that *cannot*. Noor's rule sits in the config looking real. It gets quoted in planning meetings. It shows up in the export. The only signal is Noor eventually asking why she has no French leads.

### 2. There are holes, and nobody can describe them

Some leads match no rule at all and land in the catch-all. Everyone knows the catch-all exists. Nobody can tell you what is *in* it.

"Leads we didn't plan for" is not something you can act on. But the question has a precise answer — *which combinations of country, company size, industry and source does my list not handle?* — and no routing tool computes it.

### 3. Two rules both want the lead, and a line number decides

*Partner referrals → Tom.* *Anything C-level → Enterprise.*

A C-level lead from a partner. Both rules match. Tom gets it, and the only reason is that his rule was typed first. That is not a decision anybody made. It is a coin flip that happened once, years ago, and has been repeating ever since.

### 4. "This lead went to Dana" is usually not true twice

Your rules narrowed the lead to *the EMEA team* — four people. Something else picked Dana out of those four: usually a round-robin counter. Run the identical lead through again and you get Marie.

Every routing demo shows the assignment as though the lead determined it. For most setups it did not, and nothing on the screen admits it.

---

## What this tool does

It reads the rule list the way a compiler reads a program, and reports two different kinds of thing. Keeping them apart is the whole point, so they get their own sections and their own counts, and they are never added together.

### Proofs — true of every possible lead

These are computed from the rules themselves. They stay true no matter who fills in your form next week.

| What it says | What it means |
|---|---|
| **Unreachable** | This rule can never fire. Rules above it take every lead it describes. |
| **Unsatisfiable** | This rule describes no lead at all — usually a range typed backwards, like "between 500 and 200". |
| **Redundant** | It does fire, but deleting it would change nothing: the next rule sends the same leads to the same people. |
| **Partly shadowed** | Some of what it describes is taken above it. Here is what actually reaches it. |
| **Contested** | Two rules want the same leads and disagree. Line order is what decides. |
| **Uncovered** | Nothing claims this. Here is the shape of the gap. |
| **Cannot fire before enrichment** | This rule needs a field your data provider has not returned yet. Leads arriving first fall straight past it. |
| **Resolves to nobody** | The rule wins leads and then hands them to an empty set of people. |

### Observations — true of the leads you actually have

These are counted from a sample of 70 leads.

- How many real leads fell into each gap.
- Which leads a contest actually decided.
- Which rules are perfectly alive on paper but have never fired, because every lead reaching them belongs to an account somebody already owns.

### Why they are kept apart

*"Eleven of your leads fell into a hole"* and *"your rule list has a hole"* sound like the same sentence. They are not.

The first can stop being true next Tuesday, without anybody fixing anything — you just had a quiet week. The second is a fact about the list and stays true until somebody edits it.

A dashboard that adds them into one number is telling you that a quiet week means a fixed rule list. So this tool never adds them, and never shows a combined total.

---

## The one number you will not find

There is no routing health score. No 0–100. No "your ruleset is 73% covered."

Here is why. The tool knows the *shape* of your gap — say, regulated companies under fifty people. It could count that shape as a fraction of all possible combinations and call it a percentage. That number would be meaningless, because it would assume your leads are spread evenly across every combination of country, size, industry and source. No company's leads have ever been spread evenly.

So a gap gets two things instead: a **description** you can read out loud, and a **count of real leads that fell into it**. Less quotable. Actually true.

---

## Why the rule language is deliberately limited

You can say:

- country is one of FR, DE, UK
- country is *not* one of FR, DE
- employees between 50 and 999
- existing customer is true
- industry has not been enriched yet

You cannot say:

- `revenue > employees × 50,000` (comparing two fields)
- anything with a regular expression
- "(A and B) **or** C" inside a single rule — write two rules instead

That is a real limitation and it is on purpose.

Salesforce lets you write all of those. In exchange, nobody — including Salesforce — can tell you whether your rule 14 is reachable. Answering that question over an unrestricted language is a research problem, and the answer comes back as "probably", which is useless. Nobody deletes a rule on a maybe.

Narrow the language and the same question becomes arithmetic you can do exactly. That is the trade: **less expressive rules, in exchange for answers that are proofs.**

### How the exact answer works, without the maths

Take every boundary your rules mention — every country listed, every headcount threshold — and cut each field there.

```
country     FR │ DE │ UK │ ES │ … │ not enriched yet
employees   1–49 │ 50–199 │ 200–999 │ 1,000+ │ not enriched yet
```

Those cuts come from your rules, so no rule you wrote can ever split one of the resulting slices. Every rule is now exactly a stack of whole slices, with nothing left over. Overlap, coverage and gaps become counting slices — which a computer does exactly, and quickly.

The **space map** in the console draws those slices. Pick two fields for the axes; every other field is held at one value, and the tool always prints which values, because a flat picture of an eight-dimensional thing is a slice and pretending otherwise is lying with a picture.

---

## The thing about missing data

A field that has not come back from enrichment is treated as its own value, not as "unknown".

This matters more than it sounds. A rule that says *industry is not healthcare* will **not** match a lead whose industry has not been resolved yet. That is what your routing tool already does — it just never mentions it.

In the shipped example this is exactly where a gap came from. A specialist desk was added for healthcare and government, so the regional rules were amended to say *industry is not healthcare or government* and stay out of its way. Two side effects nobody intended:

1. The specialist rule only covers companies with 50–999 people, so regulated companies **under fifty** are now claimed by nothing.
2. Leads whose industry has not been enriched fall past every regional rule too, because "not healthcare" does not match "we don't know yet".

Neither was a mistake anybody made on purpose. Both are visible on the space map in about two seconds.

---

## Reproducible and not reproducible

The tool splits routing at a seam and labels both halves.

**Eligibility** is the rules narrowing a lead down to a set of people. Same lead, same list, same set — always. Everything this tool proves is about this half.

**Selection** is picking one person from that set. Three options:

- **First eligible** — always the same person. Reproducible.
- **Round robin** — a counter decides. Ask the same question four times, get four answers.
- **Least loaded** — depends on who is carrying what right now, not on the lead.

Switch to round robin and the leads panel relabels itself **not reproducible**, and the assignments visibly change — while every single finding stays identical. That is the point: fairness is a real thing you may want, but it means the assignment is not a function of the lead, and you should be told.

---

## What it does not do

- **No clock.** No SLA timers, no "reassign after two hours", no working hours or holidays.
- **No simulation.** It does not push 500 leads through and show you queue depth over a week.
- **No territory building.** Territories are information about a rep that you supply.
- **No CRM connection.** The sample data is invented; every domain ends in `.example`.
- **No score.**

---

## Reading the console

**Ruleset** — your list, in order, because order is what decides. Dead rules are struck through. Findings appear as tags under each rule.

**Space map** — the picture. Green is claimed, amber is contested, hatched is claimed by nothing. Hover any square to see which rule wins there.

**Findings** — proofs on top, observations below, a double line between them.

**Leads** — 70 sample leads. Click one to see all four steps: whether an existing account owner took it before the rules ran, every rule that matched and which one won, who was eligible, and who was finally picked.

**Blast radius** — appears the moment you change anything. *This edit moves N of 70 leads*, and here they are. Switch off the rule the tool called dead and it says zero, which is what "dead" means.
