/**
 * eBarangay Books — database schema.
 *
 * This file is the single source of truth for the shape of the data. It is
 * driver-agnostic SQLite (drizzle-orm/sqlite-core), so the exact same schema
 * runs under two different drivers in this project:
 *
 *   - better-sqlite3  → used by the test suite (Node, headless, fast)
 *   - @tauri-apps/plugin-sql → used by the real desktop app
 *
 * CONVENTIONS (do not deviate — the whole app depends on these):
 *   - All money columns are INTEGER centavos. ₱1,234.56 is stored as 123456.
 *     Never store money as REAL/FLOAT. See src/lib/money.ts for conversion.
 *   - All dates are TEXT in ISO "YYYY-MM-DD" form, so they sort correctly
 *     as plain strings without a date function.
 *   - Nothing that has ever been posted is ever hard-deleted. See the
 *     `status` / voided-with-reversal pattern on journalEntry.
 */

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every Pagadian City barangay. One database holds all of their books.
 * `code` is the barangay's real PSGC (Philippine Standard Geographic Code)
 * — see src/lib/psgc.ts and src/db/seed/barangays.ts for where it comes
 * from and how it was verified.
 */
export const barangay = sqliteTable("barangay", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  /**
   * True only once the City Accounting Office has confirmed this barangay's
   * exact name matches what it uses on its own official documents. PSGC is
   * an authoritative reference for WHICH barangays exist, but the mirror
   * this app syncs from has its own data-entry issues (trailing whitespace
   * found in several names during the initial sync) and PSGC's canonical
   * spelling can differ slightly from local usage (e.g. "Santo Niño" vs.
   * "Sto. Niño"). Barangay Upper Sibatang is the one exception seeded
   * `true` from the start — its name is independently verified against the
   * client's real 2023 workbooks, not just PSGC.
   */
  isNameConfirmed: integer("is_name_confirmed", { mode: "boolean" }).notNull().default(false),
});

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalance = "debit" | "credit";

/**
 * Chart of accounts. Self-referencing parent_id lets non-postable group
 * headers (e.g. "1-07-05 Machinery and Equipment") roll up postable leaf
 * accounts for reporting, without those headers ever receiving a posting
 * themselves.
 */
export const account = sqliteTable(
  "account",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    accountType: text("account_type").$type<AccountType>().notNull(),
    normalBalance: text("normal_balance").$type<NormalBalance>().notNull(),
    parentId: integer("parent_id").references((): any => account.id),
    isPostable: integer("is_postable", { mode: "boolean" }).notNull().default(true),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /**
     * True when `code` is a placeholder standing in for a real COA code the
     * City Accountant hasn't confirmed yet (docs/decisions.md D12 — five
     * uncoded accounts and one code collision in the client's real 2023
     * books). A report builder must refuse to print any line that touches
     * a provisional account, so a placeholder like "PENDING-COMMUNITY-TAX"
     * can never end up on an official government report.
     */
    isProvisionalCode: integer("is_provisional_code", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    check(
      "account_type_valid",
      sql`${t.accountType} IN ('asset','liability','equity','income','expense')`,
    ),
    check("normal_balance_valid", sql`${t.normalBalance} IN ('debit','credit')`),
  ],
);

export type SignatoryRole = "prepared_by" | "certified_by" | "approved_by";

/**
 * Report signatories per barangay. Officials change over the years the
 * client will run this system — never hardcode a name into a report template.
 */
export const signatory = sqliteTable(
  "signatory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barangayId: integer("barangay_id").notNull().references(() => barangay.id),
    role: text("role").$type<SignatoryRole>().notNull(),
    name: text("name").notNull(),
    designation: text("designation").notNull(),
    effectiveFrom: text("effective_from").notNull(), // ISO date
  },
  (t) => [
    check("signatory_role_valid", sql`${t.role} IN ('prepared_by','certified_by','approved_by')`),
    // A role can be held by different people over the years (D25), but two
    // rows for the same barangay/role/date would be ambiguous about which
    // one a report should use.
    uniqueIndex("signatory_barangay_role_effective_uq").on(t.barangayId, t.role, t.effectiveFrom),
  ],
);

/* ------------------------------------------------------------------ */
/* Period control                                                      */
/* ------------------------------------------------------------------ */

export type PeriodStatus = "open" | "closed";

/**
 * One row per barangay per month.
 *
 * Years are NOT hardcoded anywhere in this system. The client explicitly
 * requires being able to open any year they choose — including tracing far
 * back (their Schedule of Advances runs to the year 2000) and working ahead
 * of the current calendar year. So `year` is a plain integer that the user
 * opens on demand; the only guard is a sanity range that would catch a
 * typo like 20024, not a policy about which years are allowed.
 *
 * Closing a period for one barangay never blocks postings for another —
 * the city office works on all 54 in parallel.
 */
export const accountingPeriod = sqliteTable(
  "accounting_period",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barangayId: integer("barangay_id").notNull().references(() => barangay.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    status: text("status").$type<PeriodStatus>().notNull().default("open"),
    closedAt: text("closed_at"),
    closedBy: integer("closed_by").references(() => appUser.id),
  },
  (t) => [
    uniqueIndex("period_barangay_year_month_uq").on(t.barangayId, t.year, t.month),
    check("period_status_valid", sql`${t.status} IN ('open','closed')`),
    check("period_month_valid", sql`${t.month} BETWEEN 1 AND 12`),
    check("period_year_sane", sql`${t.year} BETWEEN 1900 AND 2200`),
  ],
);

/* ------------------------------------------------------------------ */
/* The ledger — this is the core of the whole system                   */
/* ------------------------------------------------------------------ */

/**
 * The four books of original entry the client actually keeps. Confirmed
 * against the sheet names in UpperSibatangJV2023.xlsx and the City
 * Accountant's own handwritten note:
 *
 *   CRJ  Cash Receipts Journal        - collections
 *   CkDJ Check Disbursements Journal  - transactions paid by check
 *   CDJ  Cash Disbursements Journal   - liquidations
 *   GJ   General Journal              - adjustments
 *
 * These are four *views* over one posting engine, not four systems.
 */
export type JournalBook = "GJ" | "CRJ" | "CkDJ" | "CDJ";
export type JournalEntryStatus = "draft" | "posted" | "voided";

/**
 * One journal voucher header. A voucher is not "real" (cannot affect any
 * report) until status = 'posted'. Posting is the only path that runs
 * balance validation — see src/lib/engine/post.ts.
 *
 * Deletion is never physical. To remove the effect of a posted entry, void
 * it (status -> 'voided') which generates a reversing entry pointed to by
 * reversesEntryId. This is what COA's audit trail requires.
 */
export const journalEntry = sqliteTable(
  "journal_entry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barangayId: integer("barangay_id").notNull().references(() => barangay.id),
    periodId: integer("period_id").notNull().references(() => accountingPeriod.id),
    /**
     * Voucher number in the form YYYY-MM-NNN, scoped per barangay + book +
     * month, assigned on posting (D13/D14). Nullable so a draft has none yet,
     * and manually settable so a back-entered historical voucher keeps the
     * number written on the paper document (D15).
     */
    jevNo: text("jev_no"),
    entryDate: text("entry_date").notNull(), // ISO date
    book: text("book").$type<JournalBook>().notNull().default("GJ"),
    particulars: text("particulars").notNull(),
    status: text("status").$type<JournalEntryStatus>().notNull().default("draft"),

    /**
     * Check details, required on CkDJ entries (D6/D16). Previously buried in
     * the particulars text (e.g. "w/ CK# 3869301 (02/01/23)"), which made
     * outstanding checks impossible to derive. `clearedDate` is set when the
     * check appears on a bank statement; a check with checkNo but no
     * clearedDate is outstanding as of any date after it was issued.
     */
    checkNo: text("check_no"),
    checkDate: text("check_date"),
    clearedDate: text("cleared_date"),

    /** The bank account this entry moved money through, when applicable. */
    bankAccountId: integer("bank_account_id").references((): any => bankAccount.id),

    postedAt: text("posted_at"),
    postedBy: integer("posted_by").references(() => appUser.id),

    voidedAt: text("voided_at"),
    voidedBy: integer("voided_by").references(() => appUser.id),
    voidReason: text("void_reason"),

    /** Set on the reversing entry itself, pointing back at what it reverses. */
    reversesEntryId: integer("reverses_entry_id").references((): any => journalEntry.id),

    createdBy: integer("created_by").notNull().references(() => appUser.id),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index("journal_entry_barangay_date_idx").on(t.barangayId, t.entryDate),
    index("journal_entry_period_idx").on(t.periodId),
    check("journal_book_valid", sql`${t.book} IN ('GJ','CRJ','CkDJ','CDJ')`),
    check("journal_status_valid", sql`${t.status} IN ('draft','posted','voided')`),
    check(
      "journal_void_requires_reason",
      sql`${t.status} != 'voided' OR ${t.voidReason} IS NOT NULL`,
    ),
    // A check disbursement must carry its check details once posted (D16).
    check(
      "ckdj_requires_check_details",
      sql`${t.book} != 'CkDJ' OR ${t.status} != 'posted' OR (${t.checkNo} IS NOT NULL AND ${t.checkDate} IS NOT NULL)`,
    ),
    // A check cannot clear before it was written.
    check(
      "cleared_after_issued",
      sql`${t.clearedDate} IS NULL OR ${t.checkDate} IS NULL OR ${t.clearedDate} >= ${t.checkDate}`,
    ),
  ],
);

/**
 * One debit or credit line of a voucher. A line is exactly one side —
 * never both — enforced at the database level, not just in the UI.
 */
export const journalEntryLine = sqliteTable(
  "journal_entry_line",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id").notNull().references(() => journalEntry.id),
    lineNo: integer("line_no").notNull(),
    accountId: integer("account_id").notNull().references(() => account.id),
    debitCentavos: integer("debit_centavos").notNull().default(0),
    creditCentavos: integer("credit_centavos").notNull().default(0),
    memo: text("memo"),
  },
  (t) => [
    index("journal_entry_line_entry_idx").on(t.entryId),
    index("journal_entry_line_account_idx").on(t.accountId),
    check("line_amounts_non_negative", sql`${t.debitCentavos} >= 0 AND ${t.creditCentavos} >= 0`),
    check(
      "line_exactly_one_side",
      sql`(${t.debitCentavos} > 0 AND ${t.creditCentavos} = 0) OR (${t.creditCentavos} > 0 AND ${t.debitCentavos} = 0)`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Bank accounts and reconciliation                                     */
/* ------------------------------------------------------------------ */

/**
 * A barangay's bank accounts (D2). Upper Sibatang shows only one today, but
 * barangays commonly keep separate General Fund, SK Fund and Trust Fund
 * accounts — modelling this as a table now costs almost nothing and is
 * expensive to retrofit once there is live data.
 *
 * `glAccountId` links to the Cash in Bank account this bank account is
 * controlled by, so the reconciliation can compare against the right ledger
 * balance.
 */
export const bankAccount = sqliteTable("bank_account", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barangayId: integer("barangay_id").notNull().references(() => barangay.id),
  bankName: text("bank_name").notNull(),
  accountNo: text("account_no").notNull(),
  accountName: text("account_name").notNull(),
  glAccountId: integer("gl_account_id").notNull().references(() => account.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export type ReconciliationStatus = "draft" | "final";

/**
 * One Bank Reconciliation Statement per bank account per month (D1).
 *
 * This is a WORKSHEET. It never posts to the ledger by itself (D5) — see
 * `reconcilingItem.adjustingEntryId` for how book-side items reach the books.
 *
 * A statement may be saved as `draft` with a non-zero variance, but cannot be
 * marked `final` while the adjusted book balance disagrees with the ledger
 * unless an administrator overrides with a written reason (D7).
 */
export const bankReconciliation = sqliteTable(
  "bank_reconciliation",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bankAccountId: integer("bank_account_id").notNull().references(() => bankAccount.id),
    periodId: integer("period_id").notNull().references(() => accountingPeriod.id),
    statementDate: text("statement_date").notNull(),
    /** Ending balance per the bank statement, keyed in by hand (D3). */
    statementBalanceCentavos: integer("statement_balance_centavos").notNull(),
    /** Ledger Cash in Bank balance as of statementDate, captured when finalised. */
    bookBalanceCentavos: integer("book_balance_centavos").notNull(),
    status: text("status").$type<ReconciliationStatus>().notNull().default("draft"),
    finalisedAt: text("finalised_at"),
    finalisedBy: integer("finalised_by").references(() => appUser.id),
    /** Set only when an admin finalises despite a remaining variance (D7). */
    varianceOverrideReason: text("variance_override_reason"),
    preparedBy: integer("prepared_by").notNull().references(() => appUser.id),
  },
  (t) => [
    uniqueIndex("bank_recon_account_period_uq").on(t.bankAccountId, t.periodId),
    check("bank_recon_status_valid", sql`${t.status} IN ('draft','final')`),
  ],
);

/**
 * Which side of the reconciliation an item corrects — the single most
 * important distinction in this module (D5).
 *
 *   'bank' — a timing difference (outstanding checks, deposits in transit).
 *            The books are already correct. MUST NEVER be journalised.
 *   'book' — something genuinely missing from the books (service charge,
 *            interest credit, a recording error). Needs an adjusting entry.
 */
export type ReconcilingSide = "bank" | "book";

/** The fixed category list from the client's own template, plus an escape hatch (D4). */
export type ReconcilingItemType =
  | "checks_issued_not_taken_up"
  | "checks_issued_overstated"
  | "deposit_understated"
  | "deposit_overstated"
  | "debit_memo"
  | "credit_memo"
  | "prior_years_adjustment"
  | "other";

export const reconcilingItem = sqliteTable(
  "reconciling_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reconciliationId: integer("reconciliation_id")
      .notNull()
      .references(() => bankReconciliation.id),
    side: text("side").$type<ReconcilingSide>().notNull(),
    itemType: text("item_type").$type<ReconcilingItemType>().notNull(),
    /** Signed: negative reduces the balance on that side. */
    amountCentavos: integer("amount_centavos").notNull(),
    explanation: text("explanation"),
    /** The check this item refers to, when it is an outstanding-check item. */
    relatedEntryId: integer("related_entry_id").references(() => journalEntry.id),
    /**
     * The adjusting General Journal voucher raised for this item, if any.
     * Only ever set for side = 'book'. The system PRE-FILLS that voucher and
     * the bookkeeper posts it — the reconciliation never posts on its own (D5).
     */
    adjustingEntryId: integer("adjusting_entry_id").references(() => journalEntry.id),
  },
  (t) => [
    index("reconciling_item_recon_idx").on(t.reconciliationId),
    check("reconciling_side_valid", sql`${t.side} IN ('bank','book')`),
    check(
      "reconciling_item_type_valid",
      sql`${t.itemType} IN ('checks_issued_not_taken_up','checks_issued_overstated','deposit_understated','deposit_overstated','debit_memo','credit_memo','prior_years_adjustment','other')`,
    ),
    // A bank-side timing difference must never carry an adjusting entry (D5).
    check(
      "bank_side_never_journalised",
      sql`${t.side} != 'bank' OR ${t.adjustingEntryId} IS NULL`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Subsidiary ledgers                                                   */
/* ------------------------------------------------------------------ */

export type AdvanceStatus = "outstanding" | "liquidated";

/** Backs the Schedule of Advances to Officers & Employees. */
export const advanceToOfficer = sqliteTable(
  "advance_to_officer",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barangayId: integer("barangay_id").notNull().references(() => barangay.id),
    dateGranted: text("date_granted").notNull(),
    payee: text("payee").notNull(),
    particulars: text("particulars").notNull(),
    amountCentavos: integer("amount_centavos").notNull(),
    liquidatedCentavos: integer("liquidated_centavos").notNull().default(0),
    status: text("status").$type<AdvanceStatus>().notNull().default("outstanding"),
    /** The journal entry that recorded the original cash advance, if posted through this system. */
    sourceEntryId: integer("source_entry_id").references(() => journalEntry.id),
  },
  (t) => [check("advance_status_valid", sql`${t.status} IN ('outstanding','liquidated')`)],
);

/**
 * One row per physical asset. Depreciation is never stored — it is always
 * computed as cost * (1 - residualRate) / usefulLifeYears. The client's
 * category-level summaries (e.g. "Other Structures") are the SUM of the
 * individual assets in that category, because assets bought on different
 * dates with different lives do not share one depreciation figure.
 */
export const fixedAsset = sqliteTable(
  "fixed_asset",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    barangayId: integer("barangay_id").notNull().references(() => barangay.id),
    category: text("category").notNull(),
    description: text("description").notNull(),
    acquisitionDate: text("acquisition_date").notNull(),
    costCentavos: integer("cost_centavos").notNull(),
    usefulLifeYears: integer("useful_life_years").notNull(),
    /** Stored as a ratio, e.g. 0.10 for the client's standard 10% residual value (D17). */
    residualRate: text("residual_rate").notNull().default("0.10"),
    /** The Revised Chart of Accounts asset account this asset rolls up to (D20). */
    accountId: integer("account_id").references(() => account.id),
    /** Old numbering from the client's FA schedule (211, 215, 221...), kept for tracing (D20). */
    legacyCode: text("legacy_code"),
    disposalDate: text("disposal_date"),
  },
  (t) => [
    check("asset_life_positive", sql`${t.usefulLifeYears} > 0`),
    check("asset_cost_non_negative", sql`${t.costCentavos} >= 0`),
    check(
      "asset_disposed_after_acquired",
      sql`${t.disposalDate} IS NULL OR ${t.disposalDate} >= ${t.acquisitionDate}`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Governance                                                           */
/* ------------------------------------------------------------------ */

export type UserRole = "admin" | "bookkeeper" | "reviewer";

export const appUser = sqliteTable(
  "app_user",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    position: text("position"),
    role: text("role").$type<UserRole>().notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [check("user_role_valid", sql`${t.role} IN ('admin','bookkeeper','reviewer')`)],
);

/**
 * Append-only. Written on every post, void, period close, and chart-of-
 * accounts change. Never updated, never deleted — this table is the audit
 * trail COA will ask for.
 */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => appUser.id),
  action: text("action").notNull(), // e.g. "journal_entry.post", "period.close"
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  at: text("at").notNull().default(sql`(datetime('now'))`),
});
