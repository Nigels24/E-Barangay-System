# System Flow — eBarangay Books

What gets built, in what order, and what is done. Updated every time a task
closes. Last updated at T-017 (closed).

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
| 3.7 | Remaining report types | ✅ | T-011, T-012, T-013, T-014 | General Journal, Fixed Assets/Depreciation Schedule, Schedule of Advances, and Bank Reconciliation all done. Phase 3 is complete |

### Phase 4 — Print templates

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 4.1 | Formal print stylesheet + report headers | ✅ | T-015 | Titles only — no invented government letterhead, see T-015 notes |
| 4.2 | Rendered signatory lines on printed reports | ⬜ | | Needs 5.2 |

### Phase 5 — Admin, users, signatories

| # | Feature | Status | Task | Notes |
|---|---|---|---|---|
| 5.1 | Real users + login (D24) | ⬜ | | Until then every action is one placeholder actor — D32 |
| 5.2 | Signatory data entry (D25) | ✅ | T-016 | Also wired into 4.2's printed signature lines — see T-016 notes |
| 5.3 | Chart-of-accounts admin | ✅ | T-017 | Resolve a provisional code + activate/deactivate; adding new accounts / loading the full RCA still blocked on the client — see T-017 notes |

---

## Right now

**T-017 — Chart-of-accounts admin (5.3): CLOSED.**

Before scoping this, checked with the user directly rather than guessing:
Phase 5 had two items left — 5.1 (real users + login, D24, architecturally
the biggest remaining item in the project, touching every write path) and
5.3 (chart-of-accounts admin, D12). The user chose 5.3 first.

Re-reading `docs/decisions.md` D9-D12 and `db/seed/accounts.ts`'s own
comments surfaced something worth being explicit about: D10 calls for
"ship the full Revised Chart of Accounts; hide what is unused," but the
full RCA has never actually been seeded — only the 46 accounts
independently verified against the client's real 2023 trial balance are,
because loading the rest needs an authoritative digital copy of the COA
circular the client hasn't supplied (same posture as D20's asset-code
mapping). So this task is scoped to exactly what's blocked today per
`docs/decisions.md`'s "Still genuinely blocked" list — confirming a
provisional code (D12) and activating/deactivating an account for the
voucher dropdowns (D10) — not adding new accounts or the rest of the RCA,
which would mean inventing official government codes from memory.

- `src/lib/engine/accountsAdmin.ts` — `resolveProvisionalCode()` (replaces
  a placeholder code with the real one, clears `isProvisionalCode`; refuses
  to run a second time on the same account — the same "nothing is silently
  rewritten twice" shape void/dispose/finalize all use) and
  `setAccountActive()` (toggles `isActive` for the voucher dropdowns;
  refuses a no-op). Audit-logged, single-transaction writes (D30).
- `src/lib/queries/accountsAdmin.ts` — `listAllAccounts()` (every account,
  D9's one shared chart, no barangay scoping — the first screen in this
  project that doesn't take a `barangayId` at all) and the two actions,
  resolving the placeholder actor (D32).
- `src/lib/accountAdminForm.ts` — `newCodeProblems()`: blank check, a
  friendly early duplicate-code check ahead of the schema's own `UNIQUE`
  constraint, and refusing a "confirmed" code that is itself another
  `PENDING-*` placeholder.
- `src/screens/ChartOfAccountsAdmin.tsx` (+ `.css`) — one table, every
  account, code order. A provisional row gets a "Resolve code" inline-form
  action (same shape as T-010's Void); every row gets an Activate/Deactivate
  toggle — a plain one-click action, not an inline-confirm, since it's fully
  reversible (clicking it again undoes it), unlike Resolve/Void/Dispose.
  Reached from a new "Chart of accounts" link — on `SelectRecords` it sits
  above the barangay/year/month picker rather than inside a period card,
  since this screen needs no period or barangay at all; on
  `JournalVoucher`'s badge row it sits alongside the other five registers
  for convenience. `onBack` always returns to the bare picker, same as
  every other register screen's `onBack` already does regardless of where
  it was opened from.

24 new tests across the engine, the query seam, and the form (473 total,
up from 457). Golden test unchanged; typecheck (`tsc --noEmit` and
`tsc -b`), build, lint, and `cargo check` all clean. No schema or migration
changes needed this time — `account.isProvisionalCode`/`isActive` already
existed from Phase 1.

Live-verified end to end on a throwaway database
(`sqlite:ebarangay-verify-coa.db`, both `DB_URL` constants repointed,
`cargo build`'d, reverted and rebuilt afterward): confirmed the real chart
loads with six accounts flagged Provisional; resolved Community Tax's
placeholder code to `4-01-04-010` and confirmed it re-sorted into its
correct numeric position with the Provisional badge and "Resolve code"
button both gone (screenshotted, not just asserted — the sort-order
correctness is exactly the kind of thing an `innerText` check alone
wouldn't catch); deactivated Electricity Expense and confirmed it
disappeared from a real voucher's account dropdown while an ordinary
active account stayed offered; reactivated it and confirmed it came back.
`e2e/drive.py` re-run read-only against the real books afterward — real
`journal_entry` count (2) and provisional-account count (6) both
unchanged, confirming the throwaway database was the only thing written to.

**Deferred, not forgotten:** adding a new account, or loading the rest of
the standard Revised Chart of Accounts (D10), needs an authoritative
digital copy of the COA circular from the client — tracked in
`docs/decisions.md`'s "Still genuinely blocked" list, not a code gap.

**T-016 — Signatory data entry (5.2), wired straight through to printed
signature lines (4.2): CLOSED.**

Scoped as one task rather than two: 5.2 (a data-entry screen) has no real
value on its own until something reads it back, and the read side (4.2) is
a handful of lines once the write side exists — the same "not worth
half-shipping" reasoning every other register+report pair in this project
has followed. `signatory` was already in the schema (`id, barangayId,
role, name, designation, effectiveFrom`) with nothing ever written to it;
this closes that gap the same way T-012/T-013/T-014 closed
`fixed_asset`/`advance_to_officer`/`bank_account`.

- `src/db/schema.ts` — the one schema change: added
  `signatory_role_valid` (a CHECK constraint the table never had, unlike
  every other enum-like column in this schema) and a unique index on
  `(barangayId, role, effectiveFrom)`, since two rows for the same
  barangay/role/date would leave a report unable to say which one is
  current. `npm run db:generate` produced `drizzle/0004_gifted_spencer_
  smythe.sql` (a table-rebuild — SQLite's normal way to add a CHECK to an
  existing table — safe here since nothing has ever been written to
  `signatory`); registered in `src-tauri/src/lib.rs`'s migration list as
  version 5, the same way 0000-0003 already are.
- `src/lib/engine/signatories.ts` — `recordSignatory()` only. No
  dispose/liquidate-style follow-up action the other registers needed: a
  signatory doesn't get superseded by editing the row, it's superseded by
  a *later* row for the same role (D25's own framing — "officials change
  over the years this system will run" — literally calls for a new row
  per change, never an edit). Audit-logged, single-transaction write, same
  as every other engine module (D30).
- `src/lib/queries/signatories.ts` — `listSignatories()` +
  `createSignatoryAction()`, the screen seam.
- `src/lib/reports/signatories.ts` — `getEffectiveSignatories()`, the read
  side: for each of the three roles, the row with the latest
  `effectiveFrom` on or before a given date — the same effective-dated
  resolution payroll or any other change-of-officer record uses. No row
  for a role, or every row still in the future relative to that date,
  resolves to `null` — never an invented name or a "TBD" placeholder
  (D25), the same treatment D32 gives an internal audit actor, now applied
  to an official document instead.
- `src/screens/Signatories.tsx` (+ `.css`) — add-signatory form (role,
  name, designation, effective-from date) + the full register table. Not
  period-scoped, reached from a new "Signatories" button on
  `SelectRecords`' period card and `JournalVoucher`'s badge row, alongside
  the other four registers. No "view schedule"-style button — unlike
  Fixed Assets/Advances/Bank Reconciliation, a signatory has no report tab
  of its own; its effect is that every OTHER tab's signature block changes.
- `src/screens/Reports.tsx` — `Reports` now fetches
  `getEffectiveSignatories(db, barangayId, periodEndDate(year, month))`
  once, and `SignatureBlock` (previously a static, prop-less component)
  takes it as a prop and renders a name + designation line above the role
  caption when one is on file, or exactly the same blank line as before
  when it isn't. All six report tabs share one `SignatureBlock`, so
  wiring it once covers Trial Balance through Bank Reconciliation.

**A real bug caught by `tsc -b`, not `tsc --noEmit`:** the first pass
blindly added `signatories={signatories}` to all six `<SignatureBlock />`
call sites via a scripted replace, but five of those six sites live inside
*separate* view components (`TrialBalanceView`, `GeneralLedgerView`,
`GeneralJournalView`, `FixedAssetScheduleView`, `ScheduleOfAdvancesView`,
`BankReconciliationStatementView`) — not closures inside `Reports` — so
`signatories` was never in scope there. Plain `npx tsc --noEmit` missed
it entirely; `npm run build`'s `tsc -b` (project-references mode) caught
six `TS2304: Cannot find name 'signatories'` errors immediately. Fixed by
threading `signatories` through each view component's own props, the same
way `tb`/`fa`/`soa`/etc. already are. This is the second time in this
project `tsc -b` has caught something `--noEmit` didn't — worth always
running both, not just the faster one, before calling a UI task done.

24 new tests across the engine, the query seam, the report's effective-date
resolution, and the form (457 total, up from 438). Golden test unchanged;
typecheck (both `tsc --noEmit` and `tsc -b`), build, lint, and `cargo
check` all clean.

Live-verified end to end on a throwaway database
(`sqlite:ebarangay-verify-signatories.db`, both `DB_URL` constants
repointed, `cargo build`'d, reverted and rebuilt afterward — the new
migration applying cleanly on a fresh database was itself part of what
this verified): added a Prepared-by and an Approved-by signatory, confirmed
both appear in the register table with Certified-by correctly still
missing, then opened Reports and confirmed the Trial Balance's signature
block now shows "Juan Dela Cruz / Barangay Bookkeeper (Prepared by)" and
"Maria Santos / Punong Barangay (Approved by)" with Certified-by still a
bare blank line — and confirmed the same on a second tab (General Journal),
since one shared `SignatureBlock` should mean wiring it once covers all
six. Screenshotted every step; no visual bugs found. One script bug during
verification, not an app bug: `Signatories`' Back button correctly returns
to the bare picker (same as every other register screen), and the first
draft of the verification script assumed it would land somewhere with
"View reports" already available — fixed by re-selecting the period after
Back, same as a real bookkeeper would.

**Also fixed while here, not scope creep:** `e2e/drive.py`'s own "chrome
must not print" check read only the *first* `@media print` rule it found
across every stylesheet and returned early — harmless when only
`AppShell.css` had one, but T-015 added two more (`index.css`,
`Reports.css`), and the check started failing nondeterministically
depending on which stylesheet happened to load first. Confirmed this was
the check's own bug, not a real regression, then fixed it to concatenate
every matching rule before checking, per CLAUDE.md's "never weaken a test
— investigate" rule (strengthening a check that started failing is exactly
what that rule asks for, not skipping or loosening it).

Confirmed real database: `journal_entry` still had exactly its original 2
rows and `signatory` had 0 both before and after this task's `e2e/drive.py`
run — the ONE real write against the real file was the schema migration
itself (`_sqlx_migrations` now lists version 5), which is a legitimate,
permanent change every future launch of the real app would apply anyway,
not a D33 violation.

**T-015 — Formal print stylesheet + report headers: CLOSED.**

T-007 shipped `window.print()` only, by design — this is what turns that
into an actual document rather than a printed screenshot of the app.
Touches only `Reports.tsx`/`.css` and three small global CSS files; no
schema, engine, or query changes, so no Rust and no throwaway-database
verification were needed this time.

- `src/components/AppShell.css` — `.wrap`'s screen padding is dropped in
  print (a `@page` margin now does that job instead, so the two don't
  stack), and a `@page { margin: 1.5cm }` sets a consistent margin
  regardless of the OS print dialog's default. Paper size is deliberately
  left unset — not this app's business to pick for the office printer.
- `src/index.css` — the body's tinted app background (`--bg`) becomes
  plain white under `@media print`; a printed page is paper, not the app's
  own chrome.
- `src/screens/Reports.css` / `.tsx` — the real content of this task.
  Everything interactive (Back link, tab bar, the Print button itself, the
  General Ledger's account picker, the coloured badge pills) is hidden
  under `@media print`. A new `.print-title` block — hidden on screen,
  shown in print — states the report's own name (a `REPORT_TITLES` map,
  e.g. "Bank Reconciliation Statement") and the barangay. The on-screen
  `.hint` paragraph is deliberately left alone rather than folded into a
  new print-only string: it already states the report's as-of date or
  period in a full sentence for every one of the six tabs, which is exactly
  what a real printed statement carries too — reusing it outright avoided
  a second, parallel place for that text to drift out of sync. Table cards
  lose their box-shadow (replaced with a plain border — a shadow can render
  as a stray gray smudge on some print engines) and get `break-inside:
  avoid` so a row or the signature block doesn't split across a page.
  Also fixed a real gap the print work surfaced: the General Ledger's
  account name was shown only via the (now print-hidden) account Select,
  so a printed ledger had no way to say which account it was for — a new
  `.report-account-label` ("Account: 1-01-02-010 — Cash in Bank") now
  states it directly, on screen and in print alike.

**What this deliberately does NOT do, and why:** `.print-title` states the
report's name and the barangay — nothing more. It does not add a
government letterhead ("Republic of the Philippines", the province, etc.).
No such wording has ever been confirmed against the client's real paper
forms — nothing in this repo documents it, and the client's original
workbooks aren't available to check. Inventing one for an official
document would be worse than printing none, the same reasoning D25 already
applies to a signatory's name; this is a new instance of that same
principle, not a new decision. If the client confirms the exact wording,
it belongs in `.print-title` in `Reports.tsx`.

No new tests — this is CSS and two lines of already-tested JSX (the
`REPORT_TITLES` lookup and the account-name string), nothing with logic
worth a vitest case. Golden test unchanged; typecheck, build, lint, and
the full 438-test suite all clean.

Live-verified read-only against the real books. WebDriver can't screenshot
the OS print dialog itself, so verification worked by copying every
`@media print` rule's declarations into an unconditional `<style>` tag
(collecting *every* matching rule this time, not just the first, unlike
`e2e/drive.py`'s older single-rule check), screenshotting, then removing
it — a faithful simulation of print layout without ever opening a print
dialog or touching the database. Checked all six report tabs: topbar, tab
bar, Back link, Print button, and (on General Ledger) the account Select
all disappear; `.print-title` shows the correct title + barangay for every
tab; the General Ledger's new account-name line survives with the picker
hidden; table borders and the signature block render cleanly on a white
background. No visual bugs found.

**T-014 — Bank Reconciliation: CLOSED. Phase 3 is now complete.**

The biggest task in Phase 3, as flagged — not a report at all but a full
worksheet workflow (D1-D8), and the one item in the module explicitly
called "the most consequential decision" (D5: a reconciliation never posts
a journal entry by itself). Read `docs/decisions.md`'s Bank reconciliation
section in full before touching this area; D1-D8 govern nearly every
choice below. New pieces, in dependency order:

- `src/lib/engine/bankReconciliation.ts` — seven functions, all
  audit-logged, single-transaction writes (D30): `createBankAccount()`
  (D2 — a barangay may have several); `startReconciliation()` (refuses a
  second worksheet for the same account+period — schema.ts's own unique
  index backstops it, this just refuses first with a sentence);
  `updateReconciliationHeader()` (corrects a hand-keyed statement
  date/balance typo (D3) while still draft — refused once finalised);
  `addReconcilingItem()` (D4's fixed category list); `linkAdjustingEntry()`
  (refuses a bank-side item — D5's `bank_side_never_journalised` restated
  as a friendly refusal — and refuses linking a second entry to the same
  item); `finalizeReconciliation()` (D7: blocked on a nonzero variance
  unless a written override reason is given — no real role check exists
  yet, same D32 constraint every other "requires an admin" action in this
  app already lives with, e.g. T-008's reopen); `markCheckCleared()` (D6 —
  sets `journal_entry.clearedDate`, refuses a second clearing or a date
  before the check was written).
- `src/lib/queries/bankReconciliation.ts` — the screen seam, and where
  **D5's assisted "Create adjusting entry" flow actually lives**: not a new
  posting path, but `postAdjustingEntryAction()` building a two-line
  voucher straight from a book-side item's own signed amount (positive =
  Cash in Bank debited, the chosen offset account credited; negative = the
  reverse — ordinary double-entry from the sign, not a guess) and handing
  it to the *exact same* `postNewVoucher` every ordinary voucher goes
  through (`queries/journal.ts`) — full balance validation, period-open
  check, its own audit trail, all inherited for free. Only once that
  posting succeeds does `linkAdjustingEntry` record which voucher it turned
  out to be; a failed post links nothing. Also here: `deriveOutstandingChecks()`
  (D6 — checks derived from posted CkDJ vouchers matched to the bank
  account's own Cash in Bank ledger account, not retyped, and not offered
  twice — a check already claimed by a reconciling item in any period is
  excluded), and `getReconciliationWorksheet()`, which recomputes the
  ledger's book balance **live** on every read rather than trusting the
  stored `bank_reconciliation.book_balance_centavos` column — see the
  double-counting note below for why that matters.
- `src/lib/bankReconciliationForm.ts` — pure form rules for all four forms
  (bank account, reconciliation header, reconciling item, adjusting-entry
  offset account), same split every other screen's form-logic file
  established. Notably: a bank statement balance may be **zero** (a new
  account genuinely can have nothing yet) so it does NOT reuse
  `voucher.ts`'s `parseAmount`, which rejects zero for a voucher line — a
  new `parseNonNegativeAmount` exists just for this field. A reconciling
  item's amount is signed and non-zero (`parseSignedAmount`) — the
  opposite shape again, a third parsing rule for a third real constraint.
- `src/lib/reports/bankReconciliationStatement.ts` — the printable Reports
  tab version: every bank account on file, with that period's worksheet if
  one exists, `reconciliation: null` (not silently omitted) for one that
  doesn't yet.
- `src/screens/BankReconciliation.tsx` (+ `.css`) — the composer: bank
  account management folded into the same screen (add one, pick one to
  work on), then a `ReconciliationWorksheetSection` sub-component (keyed on
  the bank account id, so switching accounts remounts cleanly instead of
  needing a tangle of reset effects) covering start/edit-header, the items
  table with inline "Create adjusting entry" and outstanding-check
  actions, and finalize. Reached from a new "Bank reconciliation" button on
  `SelectRecords`' period card and `JournalVoucher`'s badge row.
- `Reports.tsx` gained a sixth tab, "Bank Reconciliation".
- `App.tsx` gained a `bankReconciliation` screen, threaded through
  `Reports`' `from`/`initialView` the same way every prior module was.

**A real correctness bug caught and fixed before live verification, not
after:** the worksheet's adjusted book balance was originally computed as
`liveBookBalanceCentavos + sum(all book-side items)` unconditionally. Once
a book-side item's adjusting entry is actually posted, its effect already
lives inside the live ledger balance — summing the item's amount *again* on
top of that double-counts it, and the variance would wrongly reappear right
after the bookkeeper did the correct thing. Fixed by excluding an item from
the sum once `adjustingEntryId` is set (in both
`getReconciliationWorksheet` and `buildBankReconciliationStatement`), with
a regression test locking in the exact scenario in both the query and
report test suites, and a dedicated live-verification step confirming the
variance stays at zero across the post (screenshotted before and after).

72 new tests across the engine, the query seam (including the double-count
regression), the report, and the form (438 total, up from 366). Golden test
unchanged; typecheck, build, lint, and `cargo check` all clean (Rust
touched only for the throwaway-DB verification, then reverted).

Live-verified end to end on a throwaway database
(`sqlite:ebarangay-verify-bankrec.db`, both `DB_URL` constants repointed,
`cargo build`'d, reverted and rebuilt afterward): posted a real CRJ deposit
(₱20,000) and CkDJ check (₱1,000, check #0001234) through the ordinary
voucher screen; added a bank account; started a reconciliation (statement
balance ₱19,850 — the figure a real bank statement would show once it had
processed the deposit and an unrecorded ₱150 service charge, but not yet
the outstanding check); derived the outstanding check and added it as a
bank-side item; added the ₱150 service charge as a book-side item
(variance went from ₱850 → -₱150 → ₱0, "Reconciled" badge); created and
posted its adjusting entry through the assisted flow (confirmed the JEV
number, confirmed the variance stayed exactly ₱0 across the post — the
double-count fix holding under a real post, not just a unit test);
finalised; and confirmed the printable Bank Reconciliation Statement tab
showed the identical figures with a "Final" badge. `e2e/drive.py` was also
extended with a read-only check block against the real books (empty-state
case, since no real bank account exists yet), same shape every prior
module's check took.

**Deferred, not forgotten:**
- Reconciling items cannot be edited or deleted once added, only the
  worksheet's own statement date/balance can be corrected. Consistent with
  this app's standing rule (nothing posted is ever silently rewritten,
  T-010/T-012/T-013 all made the same call) — a mistaken item gets an
  offsetting item, not a delete. Worth revisiting if that proves clumsy in
  practice.
- `journal_entry.bank_account_id` is never set by the voucher composer;
  `deriveOutstandingChecks` matches checks by the bank account's linked GL
  account instead, which is exact as long as one Cash in Bank account maps
  to one physical bank account (true today). That column is reserved for
  the day two physical accounts ever need to share one control account.
- D7's "administrator overrides with a written reason" has no real role
  check behind it — same D32 constraint as every other "requires an admin"
  action in this app (period reopen, etc.) until Phase 5.1 lands real
  users and login.

**T-013 — Schedule of Advances to Officers and Employees: CLOSED.**

Same shape as T-012 — 3.7a's data-entry gap (nothing had ever written to
`advance_to_officer`) closed first, then the report, following the template
`SYSTEM_FLOW.md` set out after T-012. New pieces, in dependency order:

- `src/lib/engine/advances.ts` — `recordAdvance()` / `liquidateAdvance()`,
  the write-batch + audit-log pattern every other engine write uses (D30).
  Same reasoning as D21 for fixed assets: granting an advance touches no
  ledger balance by itself — the actual cash disbursement is a journal
  voucher a bookkeeper posts separately, the normal way. `sourceEntryId`
  lets a row point back at that voucher for tracing (FK-checked against
  `journal_entry`), but nothing in this module posts or reads one.
  `liquidateAdvance()` accepts a partial amount, accumulating into the
  schema's own running `liquidatedCentavos` total (never a stored balance)
  so a multi-tranche advance can be liquidated across more than one
  submission — status flips from `outstanding` to `liquidated` only the
  moment the running total exactly reaches the amount granted.
- `src/lib/queries/advances.ts` — the screen seam: `listAdvances()` and the
  two actions, each resolving the placeholder actor (D32) the way every
  other write action does.
- `src/lib/advanceForm.ts` — the grant-form's pure rules (peso parsing,
  problems list) plus the liquidation field's own rule (a positive amount
  that can never exceed what's still outstanding), same split
  `fixedAssetForm.ts` established.
- `src/lib/reports/scheduleOfAdvances.ts` — `buildScheduleOfAdvances()`.
  **A real scope limit, not an oversight:** `advance_to_officer` has no
  liquidation-date column, only a running total and a status that reflects
  *now* — unlike a fixed asset's `disposalDate`, there is no way to ask what
  an advance's status would have been exactly as of a past date. What this
  report can say precisely is: advances granted on or before the report's
  period end that are *currently* outstanding. Exact for the ordinary case
  (a report run for the barangay's current period); a known gap if this
  report is ever re-run for a past month after a liquidation has since
  happened. See "Deferred" below.
- `src/screens/Advances.tsx` (+ `.css`) — a new entry screen (grant an
  advance, see the register, record a liquidation via the same
  inline-confirm pattern T-010's Void and T-012's Dispose use — except this
  one takes a typed amount, not just a confirm, so it validates against the
  row's own remaining balance before Confirm can be pressed). Not
  period-scoped, same reasoning as the fixed-asset register. Reached from a
  new "Advances" button on `SelectRecords`' period card and
  `JournalVoucher`'s badge row, alongside "Fixed assets."
- `Reports.tsx` gained a fifth tab, "Schedule of Advances" (register table,
  totals row, signature block, `Print`).
- `App.tsx` gained an `advances` screen and threaded it through `Reports`'
  `from`/`initialView` the same way `fixedAssets` already was.

36 new tests across the engine write, the query seam, the report, and the
form (366 total, up from 330). Golden test unchanged; typecheck, build,
lint, and `cargo check` all clean (Rust touched only for the throwaway-DB
verification below, then reverted).

Live-verified end to end on a throwaway database (`sqlite:ebarangay-verify-
advances.db`, both `DB_URL` constants repointed, `cargo build`'d, reverted
and rebuilt afterward): granted a ₱15,000 advance, confirmed it appeared on
both the register and the schedule with the right totals, liquidated ₱5,000
(stayed Outstanding, balance ₱10,000 on both screens), liquidated the
remaining ₱10,000 (flipped to Liquidated, dropped off the schedule, correct
empty-state message). All figures matched exactly; no visual bugs found this
time (screenshotted every step). `e2e/drive.py` was also extended with a
read-only check block against the real books — the real fixture has no
advances recorded, so it exercises the correct real state (the empty-state
message, signature block, and as-of-date hint), the same shape T-011's
General Journal check took.

**Deferred, not forgotten:** the Schedule of Advances reports current
liquidation status, not point-in-time status, because `advance_to_officer`
has no liquidation-date column — only `liquidatedCentavos` and `status`.
Re-running this report for a prior month after a liquidation has since
happened will show the advance as no longer outstanding, even though it was
outstanding as of that earlier date. Worth a `liquidatedDate` column (and,
if multiple partial liquidations ever need individual dates, a proper child
table) if this report needs to be historically accurate rather than
current-accurate.

**T-012 — Fixed Assets register + Depreciation Schedule report: CLOSED.**

Unlike T-011, this was a full vertical slice, not just a report — 3.7b's
data-entry gap (nothing had ever written to `fixed_asset`) had to be closed
first. New pieces, in dependency order:

- `src/lib/depreciation.ts` gained `monthsDepreciated()` (COA's own PPE
  Manual "15th-day rule": a month counts once the asset is in use on or
  before the 15th; acquired later, depreciation starts the next month) and
  `accumulatedDepreciationCentavos()` (monthly × months elapsed, capped at
  the depreciable base so rounding across many months can't overshoot it).
  Both computed, never stored (D18), same as the existing annual/monthly
  functions.
- `src/lib/engine/fixedAssets.ts` — `recordFixedAsset()` /
  `disposeFixedAsset()`, the write-batch + audit-log pattern every other
  engine write uses (D30). Adding an asset touches no ledger balance by
  itself (D21: the register is independent, reconciled, not forced).
- `src/lib/queries/fixedAssets.ts` — the screen seam: `listFixedAssetAccounts()`
  (PPE accounts only — `1-07-` prefix, excluding the accumulated-depreciation
  contra accounts, which an asset never links to directly), `listFixedAssets()`,
  and the two actions, each resolving the placeholder actor (D32) the way
  every other write action does.
- `src/lib/fixedAssetForm.ts` — the add-asset form's pure rules (peso/percent
  parsing, problems list), same split `voucher.ts` established.
- `src/lib/reports/fixedAssetSchedule.ts` — `buildFixedAssetSchedule()`. An
  asset drops off once disposed as of the report date. Also implements D21's
  variance report: for each linked account, the register's summed cost
  against that account's actual `buildTrialBalance` balance — scoped to cost
  only, since the register carries no formal pairing to each account's
  accumulated-depreciation contra account, and guessing that pairing from a
  naming convention would be worse than not comparing it at all. That gap is
  intentional; see "Deferred" below.
- `src/screens/FixedAssets.tsx` (+ `.css`) — a new entry screen (add an
  asset, see the register, record a disposal via the same inline-confirm
  pattern T-010's Void uses), separate from the printable report — same
  composition/print split every other screen in this app keeps. Reached
  from a new "Fixed assets" button on `SelectRecords`' period card and on
  `JournalVoucher`'s badge row (both mirroring "View reports"). Not
  period-scoped — a physical asset belongs to the barangay regardless of
  which month's books happen to be open.
- `Reports.tsx` gained a fourth tab, "Fixed Assets" (the schedule, category
  totals, the D21 variance table, signature block, `Print`).
- `App.tsx` gained a `fixedAssets` screen and threaded `Reports`'
  `initialView` so "View schedule" lands on the right tab, not always Trial
  Balance.

53 new tests across depreciation math, the engine write, the query seam, the
report, and the form (330 total, up from 281 at T-010/281 after T-011's +5).
Golden test unchanged; build/typecheck/lint/`cargo check` clean (Rust was
touched only for the throwaway-DB verification below, then reverted).

Live-verified end to end on a throwaway database (`sqlite:ebarangay-verify-
fixedassets.db`, both `DB_URL` constants repointed, `cargo build`'d, reverted
and rebuilt afterward): added a real asset (₱15,000, 10-year life, 10%
residual, acquired 2023-03-10), confirmed the schedule showed exactly
₱4,162.50 accumulated depreciation as of March 2026 (37 months × ₱112.50/mo
— the 15th-day rule and the capped-accumulation math both checked out to the
centavo), disposed it, and confirmed it dropped off the schedule while
staying visible (with a "Disposed" badge) in the register. **Caught one real
bug from the screenshot, not the `innerText` assertions**: the Fixed Assets
tab was showing both its own hint and the Trial Balance tab's cumulative-date
hint at once (the old hint's guard didn't exclude the new tab) — fixed by
narrowing that condition, then re-verified with a fresh screenshot.

**Deferred, not forgotten:** D21's variance report compares registered cost
against the ledger for the asset's own linked account only. Comparing
*accumulated depreciation* against that account's accumulated-depreciation
contra account would need a real pairing between the two — nothing in the
schema links them today (only a naming convention: e.g. `1-07-05-020` /
`1-07-05-021`), and guessing from that convention felt like exactly the kind
of silent assumption D21 exists to prevent. Worth a proper field
(`account.accumulatedDepreciationAccountId`, or similar) if this report
needs to grow that leg later.

**T-011 — General Journal report: CLOSED.**
`src/lib/reports/generalJournal.ts` (`buildGeneralJournal()`) follows the
Trial Balance/GL pattern exactly — computed straight from `journal_entry` /
`journal_entry_line`, never a stored copy (D18). Scoped to `book = 'GJ'`
specifically (the client's four physical books — GJ/CRJ/CkDJ/CDJ — are kept
separate; this is the general journal, not a combined register of all four)
and to the selected month only (not cumulative like the Trial Balance — a
journal is a record of that period's activity). Returns entries in
chronological order, each with its full set of debit/credit lines. A voided
entry's original never appears (voided ≠ posted); its reversal does, dated
on its own reversal date, since `void.ts` always books reversals to GJ
regardless of the original's book.

`Reports.tsx` gained a third tab alongside Trial Balance / General Ledger,
same shell (badges, Print button, signature block). No CSS changes needed —
reused the existing `.table-card` shell. 5 new tests (286 total, up from
281), covering: empty period, single entry with lines/totals, chronological
ordering across entries, exclusion of drafts/other months/other
books/other barangays, and the void-reversal case. Golden test unchanged,
build/typecheck/lint clean; no Rust touched, `cargo check` not applicable.

Live-verified read-only against the real running app (`e2e/drive.py`,
extended with a new check block) — Barangay Balintawak/January 2026's only
real posted entries are CRJ/CkDJ, so the live check exercises the correct
real state: the empty-state message, not a populated table. Screenshotted
and eyeballed — tab switches cleanly, hint text and empty-state message are
legible, signature block renders. The populated-table path (multiple
entries, running totals, line rendering) is covered by the unit tests
instead, since posting a real GJ entry to verify it live would violate
D33's read-only-against-real-books condition.

**Discovered while scoping 3.7, not previously flagged:** `advance_to_officer`,
`fixed_asset`, and `bank_account`/`bank_reconciliation`/`reconciling_item`
are all in the schema but nothing anywhere writes to them — no seed, no
query, no screen. Same situation as `signatory`. Schedule of Advances,
the Fixed Assets/Depreciation Schedule, and Bank Reconciliation are
therefore each a data-entry screen to design and build, not just a report
function — see "Deferred" and "Remaining work" below. Scoped out of T-011
by user decision (2026-08-21): ship General Journal now, scope the other
three as separate tasks.

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

**Current task:** none planned yet. 4.2, 5.2, and 5.3 are all done
(T-016, T-017). **5.1 (real users + login, D24) is the only Phase 5 item
left, and the only development work left in the whole project's original
plan.** It is architecturally invasive: password hashing (a new
dependency/security surface this app has none of yet), a login screen,
session state threaded through `App.tsx`, and migrating every existing
`requirePostingUserId()` call site (every write in the app) to resolve a
real current session user instead of the D32 placeholder. Given the size
and the security-sensitive, hard-to-reverse nature of those choices, check
with the user on approach before starting — the T-017 precedent (asking
before committing to 5.1 vs. 5.3) is exactly this situation, not a one-off.

---

## Deferred — decided, not forgotten

| Item | Why deferred | Revisit when |
|---|---|---|
| `signatory` read query | Nothing has ever written to the table; a query that can only return empty is speculative | Phase 5.2 |
| Fixed Assets' D21 variance report only compares registered cost, not accumulated depreciation | No formal pairing exists in the schema between an asset account and its accumulated-depreciation contra account (only a naming convention) — guessing the pairing was rejected as the exact silent assumption D21 exists to prevent | If the accountant needs the accumulated-depreciation leg too; would need a real pairing field first |
| Schedule of Advances reports current liquidation status, not point-in-time | `advance_to_officer` has no liquidation-date column — only a running `liquidatedCentavos` total and a `status` that reflects now. Re-running the report for a past month after a liquidation has since happened will understate what was outstanding as of that date | If the report needs to be historically accurate; needs a `liquidatedDate` column (or a child table, if multi-tranche liquidations ever need individual dates) |
| Reconciling items can't be edited or deleted, only the worksheet header can be corrected | Consistent with this app's "nothing posted is silently rewritten" rule, but a reconciling-item typo needs an offsetting item rather than a fix | If it proves clumsy in practice |
| `journal_entry.bank_account_id` is never set by the voucher composer | `deriveOutstandingChecks` matches by the bank account's linked GL account instead, exact only while each Cash in Bank account maps to one physical bank account (true today) | If two bank accounts ever need to share one control account |
| D7's admin override on Bank Reconciliation has no real role check | Same D32 constraint as every other "requires an admin" action in this app | Phase 5.1 |
| Voucher draft state surviving navigation | Form state is local to `JournalVoucher`; lifting it to `App` is bigger than T-007 | A bookkeeper actually complains |
| WebDriver crate behind a Cargo feature | Registration is debug-gated so it can't run in release, but the crate still compiles into every build | Before go-live |
| `.print-title` has no government letterhead (province, "Republic of the Philippines," etc.) | That exact wording has never been confirmed against the client's real paper forms — nothing in this repo documents it. Inventing one for an official document would be worse than printing none (same reasoning as D25) | If/when the client confirms the exact wording |
| Signatories can't be edited or deleted, only superseded by a later-dated row | Consistent with D25's own framing ("officials change... a new officer is a new row") and this app's "nothing is silently rewritten" rule — a typo in a name needs a corrected new row with a later `effectiveFrom`, not an edit | If it proves clumsy in practice |
| Chart-of-accounts admin can't add a new account or load the rest of the standard RCA (D10) | Needs an authoritative digital copy of the COA circular from the client — reconstructing official government codes from memory would be worse than not having them | If/when the client supplies the circular |
| A resolved provisional code can't be corrected again if it was entered wrong | `resolveProvisionalCode()` refuses to run a second time on the same account, the same one-way shape void/dispose/finalize use | If a wrong code is ever actually entered; would need a distinct remediation path |
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

In build order (see "The build order, and why" above).

### Phase 3 — the UI — ✅ complete (T-005 through T-014)

- **3.7a — Schedule of Advances.** ✅ Done — T-013.
- **3.7b — Fixed Assets / Depreciation Schedule.** ✅ Done — T-012.
- **3.7c — Bank Reconciliation.** ✅ Done — T-014.

### Phase 4 — print templates (deliberately deferred until now) — ✅ complete

- **4.1 — Formal print stylesheet + report headers.** ✅ Done — T-015.
  Titles + barangay only; no invented government letterhead — see T-015's
  notes and the Deferred table.
- **4.2 — Rendered signatory lines on printed reports.** ✅ Done — T-016,
  shipped together with 5.2 (the write side has no value without the read
  side, and the read side was small once the write side existed).

### Phase 5 — admin, users, signatories

- **5.1 — Real users + login (D24).** The only development work left in
  the project's original plan. Until this exists, every write in the
  system is attributed to one placeholder actor (D32,
  `requirePostingUserId()`) — every screen built so far (T-007 through
  T-017) depends on that pattern staying in place until this lands.
  Architecturally the biggest remaining item: password hashing (a new
  dependency/security surface this app has none of yet), a login screen,
  session state threaded through `App.tsx`, and migrating every existing
  `requirePostingUserId()` call site to resolve a real current session
  user instead of the placeholder lookup. Check scope/approach with the
  user before starting, the same way T-017 was scoped only after asking.
- **5.2 — Signatory data entry (D25).** ✅ Done — T-016, alongside 4.2.
- **5.3 — Chart-of-accounts admin.** ✅ Done — T-017. Resolving a
  provisional code and activating/deactivating an account are both live;
  adding a new account or loading the rest of the standard RCA remains
  blocked on the client (below).

### Not development work — waiting on the client (`docs/decisions.md`, "Still genuinely blocked")

Five facts, not code decisions, tracked there in detail: barangay-name
confirmation (D29, all 54 usable today regardless), the six provisional
account codes (D12) — the mechanism to enter them once known shipped in
T-017, only the actual codes are still missing — the legacy→Revised asset
code mapping (D20), current signatory names/designations (D25 — likewise,
T-016 shipped the mechanism, not the names), and the office PC's Windows
version/specs (D28). None block further development; all are required
before real data entry.
