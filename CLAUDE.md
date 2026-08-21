# eBarangay Books

## 1. What this project does

A double-entry accounting system for the **City Accounting Office of Pagadian
City, Philippines**. It holds the official books of all **54 barangays** and runs
**offline on one office PC** — no server, no network, one SQLite file.

**These are real government books, not a demo.** The people using it are
bookkeepers, not programmers. A trial balance that is off by ₱0.03 is a failed
government audit; a posted entry that can be quietly edited is a system of record
that isn't one. When a judgment call comes up, that is the standard to judge
against.

**Stack:** React 19 · TypeScript 6 · Vite 8 · Tauri 2 (Rust shell) · SQLite via
Drizzle ORM + better-sqlite3 · oxlint · vitest

---

## 2. Where things live

```
ebarangay-books/
├── src/
│   ├── db/
│   │   ├── schema.ts        13 tables — the source of truth for data shape
│   │   ├── seed/            54 PSGC barangays, 46-account chart, users
│   │   ├── adapter.ts       Tauri ⇄ better-sqlite3 boundary
│   │   ├── guards.ts        invariant enforcement
│   │   └── bootstrap.ts     first-run database creation
│   ├── lib/
│   │   ├── engine/          posting, periods, void/reversal, numbering, audit
│   │   ├── reports/         trial balance, general ledger — pure functions
│   │   ├── queries/         read paths: accounts, barangays, journal, periods
│   │   ├── money.ts         THE money boundary — centavos in, string out
│   │   ├── voucher.ts       voucher balance math
│   │   └── calendar.ts      period and date helpers
│   ├── screens/             SelectRecords · JournalVoucher · Reports
│   ├── components/          AppShell, Card, Button, Badge, Select, TextField
│   └── styles/tokens.css    design tokens
├── src-tauri/               Rust shell, transaction bridge, capabilities
├── drizzle/                 generated migrations
├── e2e/drive.py             WebDriver harness (debug builds only — see D33)
├── docs/decisions.md        D1–D33, binding client decisions
├── scripts/sync-barangays.ts
└── SYSTEM_FLOW.md           build order, what's done, and what's left
```

**Read these before touching their area:**

| Path | Why |
|---|---|
| `SYSTEM_FLOW.md` | The single progress record: what's done (Phases 1–3.6, T-001–T-010, all Reviewer-PASSed), what's left (3.7 onward), and open risks/deferred items. **Read this first, every session** — it's what lets a session with no memory of the last one continue correctly. |
| `docs/decisions.md` | D1–D33 are binding decisions made with the client. Not suggestions. Cite the D-number when one applies. |
| `src/lib/money.ts` | The only place peso ⇄ centavo conversion is allowed to happen. |
| `src/db/schema.ts` | 13 tables. Triggers here enforce immutability at the database level. |
| `src/lib/reports/__tests__/trialBalance.golden.test.ts` | Reproduces the client's real December 2023 trial balance to the centavo — ₱7,790,851.41 both sides, 46 accounts. **If this breaks, that is always a FAIL.** It is the acceptance gate for the whole engine. |

---

## 3. How work gets done

### Commands

```bash
npm run dev              # Vite on http://localhost:5173
npm run tauri dev        # the real desktop app
npm run build            # tsc -b && vite build
npx tsc --noEmit         # typecheck
npm run lint             # oxlint
npx vitest run           # 281 passing / 25 files at T-010 baseline
npm run db:generate      # drizzle-kit generate
cd src-tauri && cargo check    # if any Rust was touched
```

Run these as **plain commands**. Anything with shell expansion —
`${PIPESTATUS[0]}`, `$(...)`, `${VAR}` — trips a "Contains expansion"
confirmation prompt and stalls the session until a human clicks Yes. If you need
an exit code, run the command alone and read its output.

### Single-session workflow

This project used to run as three separate Nex panes (Coordinator / Code
Implementor / Code Reviewer) handing work off via files in `.agent-comms/`.
That folder is gone (deleted to save context, Aug 2026) and the project now
runs as one Claude session per task. `SYSTEM_FLOW.md` is the sole progress
record — it replaces what `.agent-comms/PLAN.md`, `REVIEW.md`, and
`HANDOFF.md` used to do, and its "Remaining work" section is the backlog.

For each task:

1. **Read `SYSTEM_FLOW.md`** — "Right now" for the latest state, "Remaining
   work" for what's next, "Deferred" and "Open risks" for things already
   decided or flagged. Read the relevant `docs/decisions.md` section before
   touching an area it covers.
2. **Plan before writing code** — for anything nontrivial, state the
   approach and any judgment calls (the equivalent of what `PLAN.md`'s
   "traps" sections used to capture) before implementing, so a real
   decision doesn't get made silently mid-diff.
3. **Implement**, following the non-negotiable rules below.
4. **Self-review before calling it done** — rerun the full validation loop
   (commands above, including the golden test and `cargo check` if Rust
   changed), read your own diff for the same things a strict reviewer would
   check (scope creep, money-boundary violations, weakened tests, trigger
   workarounds), and — for anything touching the UI — actually look at the
   screen (see "UI has zero automated coverage" below).
5. **Update `SYSTEM_FLOW.md`** — move the item from ⬜/🔄 to ✅, update
   "Right now," and note anything left open, the same level of detail the
   old REVIEW.md verdicts recorded. This is what makes the next session
   (with no memory of this one) able to pick up correctly.

There is no separate Reviewer to gate a `PASS` — the rigor that role
provided (independent diff read, live verification, checking non-negotiables
weren't quietly bent) is now this session's own job before reporting a task
done.

### Rules that are not negotiable

Violating one is an automatic FAIL.

- **Money is INTEGER CENTAVOS, always.** `₱2,491,080.10` is stored as
  `249108010`. Never a float, never `parseFloat` on an amount, never arithmetic
  on peso decimals. Use `toCentavos` / `formatPeso` / `formatPesoPlain` from
  `src/lib/money.ts`. Any `* 100` or `/ 100` outside that file is a defect.
  *Why: IEEE-754 drift on a trial balance is a failed government audit.*

- **Posted journal entries are NEVER deleted or edited.** They are voided with a
  reason plus an auto-generated reversing entry (`src/lib/engine/void.ts`).
  SQLite triggers enforce this. If you find yourself working around a trigger,
  stop and ask. *Why: a system of record you can quietly rewrite is not one.*

- **Reports are computed from `journal_entry_line`, never from a stored copy.**
  *Why: it is what guarantees the Trial Balance and General Ledger can never
  disagree.*

- **Nothing posts into a closed period.**

- **No signatory name is ever invented** (D25). No row for a role → a blank
  signature line, not "TBD" and not a placeholder. *Why: officials change over
  the years this system runs, and this gets printed and filed.*

- **`docs/decisions.md` D1–D33 are binding.** Code contradicting one without the
  plan explicitly revising it is a FAIL — cite the D-number.

- **Never weaken a test to make it pass.** A failing test means either the code
  is wrong or the test encodes a rule you didn't know about. Both mean
  investigate.

### Interacting with the running app

- **Never send OS-level synthetic clicks or keystrokes at any window** —
  `System Events`, `CGEvent`, `osascript` input. Standing rule, not a per-task
  judgment call. Two sessions have had such a click miss and land on a live Nex
  pane. A miss can write stray rows into the real books with nothing to explain
  them later. **Screenshotting is fine and encouraged** (`screencapture`).

- **The embedded WebDriver harness is sanctioned** (D33) — `python3
  e2e/drive.py`. A WebDriver click is dispatched inside the app's own webview at
  a DOM element, so there is no coordinate to miss. Three binding conditions:
  **debug builds only**, **read-only against real books** (never post, void, or
  open/close a period), and it **does not replace looking** — `innerText`
  assertions prove a string exists, not that it is legible or in the right
  column.

- **Interactive verification that requires a write against the real books** —
  posting something, confirming a refusal, checking a value survives
  relaunch — is the user's job, not something to attempt via a throwaway
  redirect without saying so first. Verification against a throwaway/dev
  database (a separate SQLite file, `APP_DB_URL`/`src-tauri`'s `DB_URL`
  redirected together, reverted afterward) is fine and is how T-007–T-010
  were each verified — see `SYSTEM_FLOW.md`'s history for the procedure.

### UI has zero automated coverage

There is no React testing library in this project and none is being added.
"The tests pass" says nothing about whether a screen is usable, or visible. Any
task touching the UI gets looked at — via `npm run dev` in a browser for
non-database screens, or the real Tauri window / WebDriver harness for anything
that reads the database.

### Git

**Never run `git add`, `git commit`, or `git push` unless the user explicitly
asks.** The user commits personally, once a task is done and self-reviewed.
Leave work uncommitted so `git diff` stays inspectable. Read-only git is
fine.
