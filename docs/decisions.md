# Design Decisions

Standing decisions for eBarangay Books. Each one answers a question raised by the
client's source files, resolved by applying ordinary bookkeeping practice rather than
waiting on the City Accounting Office.

Anything marked **NEEDS CLIENT FACT** is not a design choice — it is information only
the client holds. A safe default is in place so the build is never blocked.

---

## Bank reconciliation

**D1 — Bank reconciliation is in v1.**
It is a monthly statutory report the client already produces twelve times a year.
Designing it in now is far cheaper than bolting it onto a finished ledger.

**D2 — A barangay may have many bank accounts.**
Modelled as its own `bank_account` table, not a single field. Barangays commonly keep
separate General Fund, SK Fund, and Trust Fund accounts. Upper Sibatang shows only one
today, but a table costs almost nothing now and is expensive to retrofit later.

**D3 — The bank balance is keyed in by hand.**
The system is offline; there is no bank feed. Each reconciliation records the statement
date and the statement ending balance as entered by the bookkeeper.

**D4 — Reconciling item types are a fixed list, plus a free-text "Other".**
Seeded with the exact categories on the client's own template. A fixed list prevents
typos from fragmenting the report; "Other Reconciling Item" is the escape hatch their
template already provides.

**D5 — The reconciliation NEVER posts journal entries automatically.**

This is the most consequential decision in the module, and the reason is worth stating
plainly. Reconciling items fall into two kinds:

| Kind | Example | Needs a journal entry? |
|---|---|---|
| **Bank-side** (timing) | Outstanding checks, deposits in transit | **No — never.** The books are already correct; the bank simply hasn't caught up. |
| **Book-side** (real) | Bank service charge, interest credit, a recording error | **Yes.** The books are genuinely missing something. |

Auto-posting everything would corrupt the ledger by journalising timing differences that
must never be journalised. So: the reconciliation is a **worksheet**. Book-side items are
flagged, and the system offers a one-click "Create adjusting entry" that opens a
**pre-filled General Journal voucher for the bookkeeper to review and post**. Assisted,
never automatic.

**D6 — Checks are tracked individually.**
`checkNo`, `checkDate`, and `clearedDate` become real fields on check disbursements
instead of being buried in the particulars text. Outstanding checks are then *derived*
(issued, not yet cleared, as of a date) rather than retyped every month. This is what
makes the reconciliation fast and is standard in any disbursement system.

**D7 — A variance warns; it does not block.**
The bookkeeper can save a reconciliation with the adjusted balance not yet equal to the
ledger's Cash in Bank. It cannot be marked **final** until the variance is zero, or an
administrator overrides with a written reason. Blocking outright drives people to keep
shadow spreadsheets, which is worse than the problem it solves.

**D8 — Reconciliations start from go-live; history stays in Excel.**
Reconstructing past reconciliations has no audit value and enormous data-entry cost. The
2023 workbook remains the archive. (This also sidesteps the `br(jan)` sheet inside the
2023 file being dated 31 January **2022**, which is unresolved and should not be trusted
as an opening figure.)

---

## Chart of accounts

**D9 — One chart of accounts, shared by all 54 barangays.**
Uniformity is the entire purpose of a prescribed government chart, and the City
Accountant consolidates across barangays — per-barangay charts would make consolidation
impossible. Already reflected in the schema: `account` has no `barangayId`.

**D10 — Ship the full Revised Chart of Accounts; hide what is unused.**
All standard accounts are loaded but flagged `isActive = false` unless in use. Dropdowns
show only active accounts, so the bookkeeper scrolls a short list, while an administrator
can activate any standard account without a code change or a software update.

**D11 — Historical records are never relabelled.**
"Share from IRA" stays exactly as filed for 2023 and earlier. The National Tax Allotment
account exists alongside it for new entries. Retroactively rewriting filed statements is
never acceptable practice.

**D12 — One code may never mean two accounts.**
Enforced by a `UNIQUE` constraint on `account.code`, so the existing collision physically
cannot be carried into the new system.

**NEEDS CLIENT FACT — the collision and the uncoded accounts.**
Proposed resolutions below. The pattern-derived one is safe; the rest are informed
suggestions the City Accountant must confirm before go-live.

| Account | Proposed code | Confidence |
|---|---|---|
| Accum. Depreciation — Disaster Response & Rescue Equipment | `1-07-05-061` | **High** — follows the client's own consistent pattern (`-020`/`-021`, `-030`/`-031`, `-990`/`-991`) |
| Auditing Services Expense | `5-02-11-020` | Medium — sits beside Fidelity Bond Premiums `5-02-11-010`, already in their books. Travelling Expense keeps `5-02-01-010` |
| Year End Bonus | Personnel Services bonus group | Low — confirm |
| Community Tax | Local taxes / share group | Low — confirm |
| Transfer of SK Allocation | Not an expense; a transfer | Low — confirm treatment, not just code |
| Depreciation Expense | Depreciation group, split per asset class | Low — confirm whether one account or one per class |

---

## Voucher numbering

**D13 — Numbers are generated by the system in the form `YYYY-MM-NNN`.**
This matches the client's own most recent and most consistent pattern
(`2023-01-012`, `2023-04-004`). The `22-01-001` and `18-03-003` headers on the other two
books appear to be stale template text rather than live numbering.

**D14 — The sequence is scoped per barangay, per book, per month.**
`NNN` restarts at `001` each month. With 54 barangays in one database, a sequence not
scoped per barangay would collide immediately.

**D15 — Historical entries may carry a manual number.**
Automatic numbering is the default, but back-entering old vouchers must be able to
preserve the number actually written on the paper document.

**D16 — Check number and check date are required on check disbursements.**
Follows from D6.

---

## Fixed assets and depreciation

**D17 — Straight-line on 90% of cost, per asset, overridable.**
`annual = cost × (1 − residualRate) ÷ usefulLifeYears`, with `residualRate` defaulting to
`0.10`. This reproduces the client's own figures **exactly** on every category that can be
independently checked (Other Equipment `₱7,900.61`; IT Equipment `₱4,500.00`), and matches
the COA standard for LGU property, plant and equipment. Stored per asset so an exception
never requires a code change.

**D18 — Depreciation is computed, never stored.**
Storing a derived figure guarantees it eventually disagrees with its inputs.

**D19 — Depreciation is recognised monthly.**
The client's accumulated depreciation moves between the December 2023 and January 2024
trial balances, so it is already being taken up monthly. The system proposes the monthly
entry at period close; the bookkeeper reviews and posts it (same assisted principle as D5).

**D20 — Assets are converted to the Revised codes, with the legacy code kept for tracing.**
The `FA` schedule uses the old numbering (`211`, `215`, `221`, `222`, `223`, `250`, `254`).
Everything moves to the Revised chart; a `legacyCode` field preserves the old reference so
historical paperwork can still be traced. Mapping to be confirmed by the client.

**D21 — The register is built independently and reconciled, not forced.**
The asset schedule does not currently tie to the trial balance. The system makes **no
assumption about which figure is correct** — it maintains the register and produces a
variance report against the ledger control accounts. The accountant resolves the
difference; the software only makes it visible.

---

## Period control and operations

**D22 — A closed period can be reopened by an administrator, with a reason, fully logged.**
A permanent lock is the stronger audit position in theory. In practice it drives offices
to keep corrections in a side spreadsheet, which destroys the audit trail entirely. A
logged, reasoned reopen is both realistic and auditable.

**D23 — Year-end closing entries are proposed, not auto-posted.**
The system generates the closing entry to Government Equity; the accountant reviews and
posts it. Consistent with D5 and D19: the software prepares, a person approves.

**D24 — Three roles: Bookkeeper, Reviewer, Administrator.**
Standard segregation of duties. Bookkeeper enters and posts; Reviewer certifies and closes
but cannot enter; Administrator manages accounts, users and backups.

**D25 — Signatories are data, per barangay and per report.**
Never hardcoded. The same officer already appears as both "RCC II" and "Brgy. Bookkeeper"
across the client's own reports, and officials change over the years this system will run.

**D26 — Backups are automatic and verified.**
`VACUUM INTO` a timestamped copy, then `PRAGMA integrity_check` on that copy before
reporting success. An unverified backup is not a backup. Thirty kept locally, with a
scheduled prompt to copy to external media.

**D27 — Barangays are managed in the application, not hardcoded.**
An administrator adds and edits barangays. Superseded by D29 below — the full 54-barangay
roster is now seeded from PSGC, not just Barangay Upper Sibatang.

**D28 — Target platform is 64-bit Windows 10 or later.**
**NEEDS CLIENT FACT:** the specific machine's Windows version and memory, needed to pick
the installer format and to test on comparable hardware.

**D29 — The barangay roster is sourced from PSGC once, offline forever after.**
Resolves what D27 originally left as a client-supplied fact. The user's own instruction —
fetch from the Philippine Standard Geographic Code API rather than type in a list — is
right in principle: PSGC is an authoritative public register of which barangays exist, so
using it beats guessing names from memory. But calling it live from inside the app
contradicts the project's very first constraint (purely offline, one office PC, no
internet dependency), and the literal ask (fetch-on-mount, cache in `localStorage`) doesn't
fit an app with no browser storage at all.

Resolution: `npm run sync:barangays` (`scripts/sync-barangays.ts`) makes the ONE real
network call this project ever makes — run once, by a developer, on a machine with
internet, hitting `https://psgc.cloud/api/cities-municipalities/{cityCode}/barangays`
(service function `getBarangaysByCity` in `src/lib/psgc.ts`; Pagadian City's code,
`0907322000`, confirmed live and stored as `PAGADIAN_CITY_CODE`). The output is reviewed
by hand and pasted into `src/db/seed/barangays.ts` as real seed data. The shipped app
never calls the API — it reads only the local database, exactly like every other seed
module. `getBarangaysByCity`'s own tests mock `fetch`, so the suite stays offline and fast.

The first real sync (2026-08-12) surfaced exactly the kind of problem this review step
exists to catch, in psgc.cloud's own stored data: 8 barangay names had stray whitespace
("Balangasan " for "Balangasan"), and "Santo Niño" came back as "Santo NiÃ±o" — UTF-8
bytes misread as Latin-1 in the source data itself, confirmed with a raw `curl` + JSON
parse. Both are mechanical, verifiable fixes (not judgment calls) and are now handled
automatically by the sync script. It also corrected an earlier mistake in this project:
an intermediate summarization tool had reported 57 barangays for Pagadian City; a direct,
unmediated fetch gives exactly 54, matching the client's own original figure.

Every barangay except Upper Sibatang is seeded with `isNameConfirmed: false` — real per
PSGC, but not yet checked against how the City Accounting Office itself refers to each one
on its own documents. A report builder should treat this the same way it treats
`account.isProvisionalCode` (D12): confirmed accuracy of WHICH barangays exist is not the
same as confirmed accuracy of exact spelling on an official government report.

For the record: cross-checking the real PSGC list also settled an open question about the
original prototype's five illustrative barangay names. "Barangay Poblacion", "Barangay San
Isidro", and "Barangay Bagong Silang" do not exist in Pagadian City — confirmed fictional,
not just unverified. "Barangay Santo Niño" is real, but only by coincidence; its presence
in the old prototype was never evidence of anything.

---

## Still genuinely blocked on the client

Everything above is decided and buildable. These five are facts, not choices:

1. Confirmation that each of the 54 PSGC-sourced barangay names *(D29)* matches how the
   City Accounting Office itself refers to it on its own documents. Not blocking — all 54
   are seeded and usable today; this is a pre-go-live review, tracked per-barangay via
   `isNameConfirmed`.
2. Correct codes for the duplicate and the five uncoded accounts *(D12)* —
   seed script ready at `src/db/seed/accounts.ts`. The six affected accounts
   are already seeded with their proposed or placeholder codes and flagged
   `isProvisionalCode: true` at the database level, so a report builder can
   refuse to print any line touching one of them until this is resolved.
3. Confirmation of the legacy → Revised asset code mapping *(D20)*
4. Current names and designations of the signatories *(D25)*
5. Windows version and specs of the office PC *(D28)*

None of these block development. All are required before real data is entered.
