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
├── SYSTEM_FLOW.md           build order + what's done
└── .agent-comms/            agent handoff files — not product code
```

**Read these before touching their area:**

| Path | Why |
|---|---|
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
npx vitest run           # 262 passing / 25 files at T-007 baseline
npm run db:generate      # drizzle-kit generate
cd src-tauri && cargo check    # if any Rust was touched
```

Run these as **plain commands**. Anything with shell expansion —
`${PIPESTATUS[0]}`, `$(...)`, `${VAR}` — trips a "Contains expansion"
confirmation prompt and stalls the session until a human clicks Yes. If you need
an exit code, run the command alone and read its output.

### The three-agent workflow

| Pane | Role file | Does |
|---|---|---|
| Coordinator | `.agent-comms/ROLE-COORDINATOR.md` | plans with the user, routes, closes |
| Code Implementor | `.agent-comms/ROLE-IMPLEMENTOR.md` | writes and tests the code |
| Code Reviewer | `.agent-comms/ROLE-REVIEWER.md` | PASS/FAIL gate |

Protocol: `.agent-comms/HANDOFF.md`. Progress: `SYSTEM_FLOW.md`.

Only a Reviewer `PASS` closes a task. All re-work routes through the
Coordinator — the Reviewer never messages the Implementor directly.

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

- **Interactive verification that requires a write** — posting something,
  confirming a refusal, checking a value survives relaunch — is the user's job.
  Say so in the notes and let the Coordinator arrange it.

### UI has zero automated coverage

There is no React testing library in this project and none is being added.
"The tests pass" says nothing about whether a screen is usable, or visible. Any
task touching the UI gets looked at — via `npm run dev` in a browser for
non-database screens, or the real Tauri window / WebDriver harness for anything
that reads the database.

### Git

**No agent runs `git add`, `git commit`, or `git push`.** The user commits
personally, after the Coordinator reports a PASS. Leave work uncommitted —
`git diff` is what the Reviewer reviews. Read-only git is fine.
