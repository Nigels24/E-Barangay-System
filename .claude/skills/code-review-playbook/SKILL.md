---
name: code-review-playbook
description: Structured code review across three lenses — correctness, database/data-integrity, and security. Use when reviewing a diff or pull request, acting as the Code Reviewer pane, deciding PASS or FAIL on an implementation, auditing schema or migration changes, or checking code for security issues. Triggers on "review this", "review the diff", "code review", "PASS or FAIL", "audit this change", "security review", "database review", "check this migration".
---

# Code review playbook

Three lenses, run as three deliberate passes. Reading the diff once and hoping
everything surfaces is how real defects ship.

Before starting: read the plan (what was asked) and the implementation notes
(what the author claims). Then read the **actual diff** — `git diff` plus
`git status` for new files. The notes are a claim; the diff is evidence. Where
they disagree, that disagreement is itself a finding.

---

## Pass 1 — Correctness

**Question: does it do what was asked, and is it right at the edges?**

- [ ] Walk the acceptance criteria **one by one**. "Mostly satisfied" is a FAIL.
- [ ] Anything in the diff that was *not* asked for — scope creep is a finding,
      because unreviewed intent is unreviewed risk.
- [ ] Edges: empty, single element, zero, negative, null/undefined, maximum,
      duplicate, out-of-order.
- [ ] **States that look the same but aren't.** "Nothing exists" vs "everything
      cancelled out" vs "the query failed" vs "still loading" — collapsing these
      into one message lies to the user. This is one of the most common real
      defects and it almost never has a test.
- [ ] Error paths: what does the user actually see when it breaks? Is failure
      distinguishable from success-with-nothing?
- [ ] Do the tests assert **behaviour**, or only that the code ran without
      throwing?
- [ ] Was any existing test weakened, skipped, or deleted to make this pass?
      Always a FAIL — a failing test means either the code is wrong or the test
      encodes a rule the author didn't know about.
- [ ] Test count before and after. Does the delta match the claim exactly?
- [ ] Off-by-one in every loop, slice, and range.
- [ ] Ordering and concurrency where they apply. What if two of these run at
      once?

---

## Pass 2 — Database / data integrity

**Applies whenever the diff touches schema, a query, a migration, or persisted
state.**

### Schema and migrations

- [ ] Migration runs forward on a **populated** database, not just an empty one.
- [ ] Is there a down path, or at least a documented recovery story?
- [ ] Adding a NOT NULL column to an existing table — what is the default for
      existing rows?
- [ ] Constraints live **in the database**, not only in the app. App validation
      is a UX affordance; the constraint is the guarantee.
- [ ] Foreign keys and cascade behaviour: does a delete quietly take children
      with it?

### Correctness of data

- [ ] **Numeric precision.** Floats for money is a defect, always — store minor
      units as integers. Check the parse boundary and the format boundary, and
      any `* 100` / `/ 100` outside the one sanctioned conversion module.
- [ ] Rounding: where does it happen, how many times, and in which direction?
- [ ] Timezones and date boundaries on anything stored or compared.
- [ ] Nullable columns the code treats as guaranteed.

### Writes

- [ ] **Atomicity.** Is a multi-step write actually in a transaction, or just
      sequential statements hoping nothing dies in between? Name the partial
      state that exists if it fails at each step.
- [ ] **Append-only means append-only.** Any path that deletes or mutates a
      record the domain says is immutable — or routes *around* a trigger
      enforcing it — is a defect regardless of convenience.
- [ ] **Writes from things that should only read.** Trace what a call actually
      does rather than trusting its name. A `getOrCreate` behind a function
      called `openSummary`, a dev harness that clicks a button which inserts —
      this is how rows appear that nobody can explain later.
- [ ] Idempotency: what happens if this runs twice?

### Reads

- [ ] Derived values **computed from source rows**, never a stored copy that can
      drift. A cached total that disagrees with the ledger is worse than a slow
      query.
- [ ] N+1 queries in loops.
- [ ] Indexes on the columns actually filtered and joined on.
- [ ] Unbounded result sets — will this still work at 100× the data?

---

## Pass 3 — Security

- [ ] **Injection.** Parameterised queries only; no string-built SQL. No
      unsanitised HTML into the DOM. No shell interpolation of user input.
- [ ] **Authorisation checked server-side, on every path.** A hidden button is
      not a permission. Can the endpoint be called directly?
- [ ] **Secrets** — nothing hardcoded, nothing logged, nothing committed. Check
      new config files and the diff for keys.
- [ ] **What ships in a release build.** A debug harness, test hook, seeded
      account, or automation server compiled into production is a real finding.
      **Verify the gating mechanism is the one the docs claim** — a runtime
      `if (debug)` and a compile-time exclusion are different guarantees, and
      documentation drifts from code.
- [ ] **Error messages** that leak internals — stack traces, queries, file
      paths, versions — to a user.
- [ ] **Dependencies** added by this diff: actually needed, maintained,
      reputable, and did a lockfile change come with it?
- [ ] **Audit trail** on anything sensitive: who, what, when — and can it be
      forged or silently edited?
- [ ] Anything that writes to a real production dataset from a dev or test path.

---

## Pass 4 — If the UI changed, look at it

Passing tests say nothing about whether a screen is usable, or even visible.

- [ ] Text that overflows, truncates, or wraps badly
- [ ] A disabled control that doesn't *look* disabled
- [ ] Contrast too low to read
- [ ] Elements off-screen or below the fold that shouldn't be
- [ ] **Developer syntax leaking into user-facing copy** — markdown backticks,
      camelCase identifiers, raw enum values, stack traces
- [ ] Loading, empty, and error states — all three, not just the happy path

If you could not look — permission denied, no harness, needs a write you may not
make — **say so plainly**. Never imply you saw something you didn't.

---

## Writing the verdict

### What earns a FAIL

Real defects only: wrong behaviour, data-integrity risk, unhandled edge case,
security problem, weakened or failing test, or the plan not actually satisfied.

**Not a FAIL:** style, naming you'd have chosen differently, speculative
refactors, "I'd have structured this differently." Those are non-blocking notes.
A FAIL costs a full re-planning round-trip — spend it on things that would hurt
in production.

### Every finding needs four parts

1. **Where** — file and line
2. **What** — the defect, traced concretely through the code
3. **Why it matters** — the consequence, to a real user, in their words
4. **A specific fix** — not "handle this better"

> ❌ "This feels fragile."
>
> ✅ "`buildTrialBalance` sums gross turnover instead of netting per account, so
> any account with both debits and credits reports an inflated balance."

**Reproduce it if you can.** One finding demonstrated on real data outranks five
you reasoned your way to — and it is the difference between a report the author
argues with and one they fix.

### Always close with what you could not verify

Even on a PASS. Whoever reads this verdict will tell someone "it's safe to
ship" — they need the edges of your confidence, not just its centre.

---

## Two failure modes to watch in yourself

**Rubber-stamping.** Tests passed, so you wrote PASS. But tests only cover what
someone thought to test. Catching what the tooling can't is the entire reason a
human-equivalent reviewer exists.

**Reviewing the notes instead of the code.** The author writes a persuasive
account of what they did. Read the diff first and form your own view — *then*
read the notes and check them against it.
