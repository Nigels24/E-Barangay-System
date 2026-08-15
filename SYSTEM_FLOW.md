# System Flow — eBarangay Books

**Written by:** Coordinator · **Read by:** everyone, including Nige

What gets built, in what order, and what is done. Updated every time a task
closes. Last updated at T-007 (closed).

---

## The build order, and why

The engine came before any screen, and that ordering is the spine of the whole
project: a screen built on arithmetic nobody trusts is a screen you throw away.
So the money rules, the posting engine, and the report builders were finished
and proven against the client's **real December 2023 trial balance** —
₱7,790,851.41 on both sides across 46 accounts — before a single pixel existed.
The golden test is what lets every UI task afterwards be about the *screen*
rather than the numbers.

The desktop shell and the transaction bridge came next, because a UI that can't
write atomically is a UI that corrupts books under a crash. Only then the
screens, in the order a bookkeeper actually meets them: pick the barangay and
period → enter a voucher → read the reports.

Print templates and admin come last, deliberately. They are the parts that can
be redone cheaply.

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
Engine &    Desktop     The UI      Print       Admin,
money       shell &                 templates   users,
rules       database                            signatories
```

---

## Progress

Legend: ✅ done (Reviewer PASS) · 🔄 in progress · ⬜ not started · ⏸️ blocked

### Phase 1 — Engine and money rules

> Establishes: arithmetic that can be trusted, proven against real client books.

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 1.1 | Integer-centavo money layer (`money.ts`) | ✅ | — | The one conversion boundary |
| 1.2 | Schema — 13 tables + immutability triggers | ✅ | — | `src/db/schema.ts` |
| 1.3 | Seed — 54 PSGC barangays, 46-account chart | ✅ | — | |
| 1.4 | Posting engine, periods, numbering, audit | ✅ | — | `src/lib/engine/` |
| 1.5 | Void + auto reversing entry | ✅ | — | Posted entries are never edited |
| 1.6 | Trial Balance + General Ledger builders | ✅ | — | Pure functions, from `journal_entry_line` |
| 1.7 | Golden test vs real Dec-2023 books | ✅ | — | ₱7,790,851.41 / 46 accounts. Breaking it is always a FAIL |
| 1.8 | `formatPesoPlain()` for report columns | ✅ | T-001 | |
| 1.9 | Depreciation helpers | ✅ | — | `src/lib/depreciation.ts` |

### Phase 2 — Desktop shell and database

> Establishes: it runs as a real offline app, and writes are atomic.

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 2.1 | Design system + app shell | ✅ | T-002 | Verified by user; formal review not completed |
| 2.2 | Rust transaction bridge + async engine (D30) | ✅ | T-003 | Atomicity verified independently |
| 2.3 | App database bootstrap | ✅ | T-004 | First-run creation + seed |

### Phase 3 — The UI

> Establishes: a bookkeeper can actually do the job.

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 3.1 | Selection screen — barangay / year / month | ✅ | T-005 | Wired to the real database |
| 3.2 | Journal voucher screen | ✅ | T-006 | Interactive verification driven by the user |
| 3.3 | Trial Balance + General Ledger screens | ✅ | T-007 | Passed after 1 revision (2 findings, both fixed) |
| 3.4 | Period close / reopen screen | ⬜ | | Blocks 3.5 — see Open risks |
| 3.5 | Period gating in the voucher composer | ⏸️ | | Waiting on 3.4 |
| 3.6 | Void a posted entry, from a screen | ⬜ | | Engine exists; no UI reaches it |
| 3.7 | Remaining report types | ⬜ | | General Journal, Schedule of Advances, bank rec, fixed assets |

### Phase 4 — Print templates

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 4.1 | Formal print stylesheet + report headers | ⬜ | | T-007 ships `window.print()` only, by design |
| 4.2 | Rendered signatory lines on printed reports | ⬜ | | Needs 5.2 |

### Phase 5 — Admin, users, signatories

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 5.1 | Real users + login (D24) | ⬜ | | Until then every action is one placeholder actor — D32 |
| 5.2 | Signatory data entry (D25) | ⬜ | | No row has ever been written to `signatory` |
| 5.3 | Chart-of-accounts admin | ⬜ | | Confirming provisional codes — D12 |

---

## Right now

**T-007 — Trial Balance and General Ledger screens: CLOSED (Reviewer PASS).**
Shipped after one revision loop. First review FAILed on two findings — the
WebDriver harness could write a real `accounting_period` row via `ensurePeriod()`
(contradicting D33), and the Trial Balance's empty state said "No posted
activity" on a period that actually had posted activity netting to zero,
contradicting the General Ledger one tab away. Both fixed exactly as scoped
(harness now prechecks the period exists before clicking Proceed; a new
`hasPostedLines` flag drives the correct empty-state message) without touching
`ensurePeriod()` or the report's zero-net filter. Second review PASSed: 264
tests, golden test unchanged, build/typecheck/lint/cargo check clean, harness
run live with zero database writes confirmed by row-count diff.

**One open item, non-blocking:** the Reviewer could not get a clean on-screen
screenshot of Barangay Alegria/January 2026's corrected message this session
(a snag in the Reviewer's own throwaway script, not an app defect — everything
that would catch a real wiring mistake was confirmed independently instead).
A quick screenshot of Alegria's Trial Balance and General Ledger tabs is a
worthwhile follow-up whenever convenient.

**Current task:** none planned yet.
**Next up:** 3.4 period close/reopen, which unblocks 3.5.

---

## Deferred — decided, not forgotten

| Item | Why deferred | Revisit when |
|---|---|---|
| `signatory` read query | Nothing has ever written to the table; a query that can only return empty is speculative | Phase 5.2 |
| Voucher draft state surviving navigation | Form state is local to `JournalVoucher`; lifting it to `App` is bigger than T-007 | A bookkeeper actually complains |
| WebDriver crate behind a Cargo feature | Registration is debug-gated so it can't run in release, but the crate still compiles into every build | Before go-live |
| Formal print templates | Cheap to redo; the screens had to be right first | Phase 4 |

---

## Open risks

| Risk | Impact | Mitigation |
|---|---|---|
| **`closePeriod` has zero callers in the shipped UI.** Every period a bookkeeper can open is open by construction | Period gating is unenforceable today; a closed-period rule that nothing can trigger is a rule that isn't tested in reality | 3.4 must land, and 3.5 must be an explicit acceptance item on it |
| **One `accounting_period` row nobody has accounted for**: `barangay_id 2`, `2025-01` (Barangay Balangasan) | Unexplained rows in official books. Provenance unknown | Finding 1 of T-007 closes the mechanism that can silently create them. Origin of this specific row still unresolved |
| **`accounting_period` has no append-only trigger** | Unlike `journal_entry`, nothing at the database level stops or records a stray period row | Consider a trigger before go-live |
| **UI has zero automated coverage** — no React testing library, by choice | Passing tests say nothing about whether a screen is legible or visible | Every UI task gets looked at by eye; the Reviewer's §4b is not optional |
| **Provisional-account badge (D12) has never rendered on screen** | Covered at the data layer, by nothing visually | Needs a period with posted activity on a `PENDING-*` account |
