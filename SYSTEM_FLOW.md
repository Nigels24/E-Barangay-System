# System Flow — eBarangay Books

What gets built, in what order, and what is done. Updated every time a task
closes. Last updated at T-010 (closed).

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
| 3.4 | Period close / reopen screen | ✅ | T-008 | Passed first review, no revision loop |
| 3.5 | Period gating in the voucher composer | ✅ | T-009 | Passed first review, no revision loop |
| 3.6 | Void a posted entry, from a screen | ✅ | T-010 | Passed first review, no revision loop |
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

**T-010 — Void a posted entry, from a screen: CLOSED (Reviewer PASS).**
Shipped clean, no revision loop. New `voidPostedVoucher()`
(`src/lib/queries/journal.ts`) is a thin wrapper around the already-tested
`voidEntry()` (`src/lib/engine/void.ts`, untouched) — resolves the actor via
`requirePostingUserId()` (D32), always reverses into the period currently
open on screen (no cross-period void). `JournalVoucher.tsx` gained an
"Actions" column: one Void control per voucher (on its first line only), a
reason + reversal-date two-step inline confirm (reversal date clamped to the
period, defaulting to today-if-in-range else the period's last day), and a
closed-period message in place of the button when the period is closed. A
voided reversal entry gets the same Void control as any other posted entry —
no special-casing. 281 tests (271 baseline + 10 new), golden test unchanged,
build/typecheck/lint/cargo check clean. Live-verified end to end on a
throwaway database: void flips the original to Voided, a new Posted reversal
appears with swapped debit/credit sides, closed-period blocks with a message,
and voiding the reversal itself works.

**Two open items, non-blocking, carried forward from T-008/T-009:** the
reopen-reason field's on-screen legibility and T-009's closed-period
badge/message have still never been confirmed by a human eye across several
review passes (each blocked by unrelated circumstances — a busy screen, a
colliding session). DOM-level structure is confirmed correct in both cases;
pixel legibility isn't yet. Worth a glance next time the app is open.

**Current task:** none planned yet — `.agent-comms/` (the three-pane
Coordinator/Implementor/Reviewer protocol files) was deleted to save
context; this file plus `CLAUDE.md` are now the full record. See
"Remaining work" below for what's next.

---

## Deferred — decided, not forgotten

| Item | Why deferred | Revisit when |
|---|---|---|
| `signatory` read query | Nothing has ever written to the table; a query that can only return empty is speculative | Phase 5.2 |
| Voucher draft state surviving navigation | Form state is local to `JournalVoucher`; lifting it to `App` is bigger than T-007 | A bookkeeper actually complains |
| WebDriver crate behind a Cargo feature | Registration is debug-gated so it can't run in release, but the crate still compiles into every build | Before go-live |
| Formal print templates | Cheap to redo; the screens had to be right first | Phase 4 |
| Cross-period void (void from one screen, reverse into a different open period) | `voidEntry()` supports it; the screen deliberately doesn't expose a period picker — no case today asks for it | Nothing today; revisit if a bookkeeper needs it |
| Admin/audit-log viewer ("who voided what, when") | Every void is already fully audited at the row level (D22); there's just no screen that reads it back | Phase 5, alongside real users/login |
| Bulk void | Nothing has asked for it; one-at-a-time matches how a bookkeeper actually works | If it comes up |

---

## Open risks

| Risk | Impact | Mitigation |
|---|---|---|
| **One `accounting_period` row nobody has accounted for**: `barangay_id 2`, `2025-01` (Barangay Balangasan) | Unexplained rows in official books. Provenance unknown | Finding 1 of T-007 closes the mechanism that can silently create them. Origin of this specific row still unresolved |
| **`accounting_period` has no append-only trigger** | Unlike `journal_entry`, nothing at the database level stops or records a stray period row | Consider a trigger before go-live |
| **UI has zero automated coverage** — no React testing library, by choice | Passing tests say nothing about whether a screen is legible or visible | Every UI task gets looked at by eye; the Reviewer's §4b is not optional |
| **Provisional-account badge (D12) has never rendered on screen** | Covered at the data layer, by nothing visually | Needs a period with posted activity on a `PENDING-*` account |
| **`void.ts` doesn't validate `reversalDate` falls within the reversal period's month** (unlike `postEntry`, which checks this) | A caller that bypasses the UI's date clamp could theoretically post a reversal dated outside its own period | Currently closed defensively at the UI layer only (T-010's `min`/`max` clamp on the reversal-date field) — engine itself still has the gap. Worth a proper fix in `void.ts` before any second caller of `voidEntry` exists |

---

## Remaining work

In build order (see "The build order, and why" above). Nothing below is
started.

### Phase 3 — the UI (one item left)

- **3.7 — Remaining report types.** General Journal, Schedule of Advances,
  bank reconciliation, fixed assets/depreciation schedule. `src/lib/reports/`
  already has the pattern to follow (pure functions from
  `journal_entry_line`, proven against the golden test) — `Reports.tsx`
  already has the Trial Balance / General Ledger screens as the template for
  a third. Depreciation math already exists (`src/lib/depreciation.ts`,
  1.9); bank reconciliation does not — check `docs/decisions.md` §"Bank
  reconciliation" before building, some of it is still open.

### Phase 4 — print templates (deliberately deferred until now)

- **4.1 — Formal print stylesheet + report headers.** T-007 shipped
  `window.print()` only, by design (cheap to redo later, and the screens
  had to be right first).
- **4.2 — Rendered signatory lines on printed reports.** Needs 5.2 first —
  no `signatory` row has ever been written, and D25 forbids inventing a
  name, so this can't be built ahead of the data.

### Phase 5 — admin, users, signatories

- **5.1 — Real users + login (D24).** Until this exists, every write in the
  system is attributed to one placeholder actor (D32,
  `requirePostingUserId()`) — every screen built so far (T-007 through
  T-010) depends on that pattern staying in place until this lands.
- **5.2 — Signatory data entry (D25).** No row has ever been written to the
  `signatory` table. Blocks 4.2. No name may ever be invented — a role
  with no row gets a blank signature line on a printed report, never
  "TBD" or a placeholder.
- **5.3 — Chart-of-accounts admin.** Confirming the provisional codes
  tracked at the database level (`isProvisionalCode`, D12) — six accounts
  currently seeded with placeholder or proposed codes.

### Not development work — waiting on the client (`docs/decisions.md`, "Still genuinely blocked")

Five facts, not code decisions, tracked there in detail: barangay-name
confirmation (D29, all 54 usable today regardless), the six provisional
account codes (D12), the legacy→Revised asset code mapping (D20), current
signatory names/designations (D25, blocks 5.2/4.2), and the office PC's
Windows version/specs (D28). None block further development; all are
required before real data entry.
