import { useEffect, useRef, useState } from "react";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { TextField } from "../components/TextField";
import {
  ArrowLeftIcon,
  BankIcon,
  BarChartIcon,
  BoxIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CheckIcon,
  ListIcon,
  PlusIcon,
  SignatureIcon,
  TrashIcon,
  WalletIcon,
} from "../components/icons";
import type { JournalBook, JournalEntryStatus, PeriodStatus } from "../db/schema";
import {
  defaultDateInPeriod,
  formatPeriodLabel,
  isWithinPeriod,
  monthLabel,
  periodEndDate,
  periodStartDate,
} from "../lib/calendar";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { accountLabel, listPostableAccounts, type AccountOption } from "../lib/queries/accounts";
import {
  listPeriodVouchers,
  postNewVoucher,
  summarisePeriod,
  voidPostedVoucher,
  type PeriodVoucher,
  type PostedVoucher,
} from "../lib/queries/journal";
import { formatPeso } from "../lib/money";
import {
  emptyHeader,
  emptyLine,
  needsCheckDetails,
  voucherProblems,
  voucherTotals,
  toDraftLines,
  type VoucherHeaderForm,
  type VoucherLineForm,
} from "../lib/voucher";
import "./JournalVoucher.css";

const BOOK_OPTIONS: SelectOption[] = [
  { value: "GJ", label: "General Journal (GJ)" },
  { value: "CRJ", label: "Cash Receipts Journal (CRJ)" },
  { value: "CkDJ", label: "Check Disbursement Journal (CkDJ)" },
  { value: "CDJ", label: "Cash Disbursement Journal (CDJ)" },
];

function statusTone(status: JournalEntryStatus): BadgeTone {
  if (status === "posted") return "posted";
  if (status === "voided") return "voided";
  return "draft";
}

function statusLabel(status: JournalEntryStatus): string {
  if (status === "posted") return "Posted";
  if (status === "voided") return "Voided";
  return "Draft";
}

interface JournalVoucherProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  periodId: number;
  year: number;
  month: number;
  status: PeriodStatus;
  onBack: () => void;
  onViewReports: () => void;
  onOpenFixedAssets: () => void;
  onOpenAdvances: () => void;
  onOpenBankReconciliation: () => void;
  onOpenSignatories: () => void;
  onOpenChartOfAccounts: () => void;
}

/**
 * The voucher composer: one voucher, many lines, posted against a period
 * that is already open.
 *
 * Every rule worth being wrong about — totals, balance, what stops Post from
 * being pressed — lives in `src/lib/voucher.ts` and is tested there. This
 * component holds form state and renders what those functions return, the
 * same division `SelectRecords` established for the picker screen.
 */
export function JournalVoucher({
  db,
  barangayId,
  barangayName,
  periodId,
  year,
  month,
  status,
  onBack,
  onViewReports,
  onOpenFixedAssets,
  onOpenAdvances,
  onOpenBankReconciliation,
  onOpenSignatories,
  onOpenChartOfAccounts,
}: JournalVoucherProps) {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [vouchers, setVouchers] = useState<PeriodVoucher[] | null>(null);
  const [vouchersError, setVouchersError] = useState<string | null>(null);

  // Line identity for React keys, never persisted — the engine assigns its
  // own lineNo on write.
  const nextLineKey = useRef(0);
  function newLineKey(): string {
    nextLineKey.current += 1;
    return `line-${nextLineKey.current}`;
  }

  const [header, setHeader] = useState<VoucherHeaderForm>(() => emptyHeader(periodStartDate(year, month)));
  const [lines, setLines] = useState<VoucherLineForm[]>(() => [emptyLine(newLineKey()), emptyLine(newLineKey())]);

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [lastPosted, setLastPosted] = useState<PostedVoucher | null>(null);

  // Which posted voucher's row is showing the void confirm form, if any —
  // only one at a time, same "one inline confirm open" shape T-008 used.
  const [voidingEntryId, setVoidingEntryId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReversalDate, setVoidReversalDate] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPostableAccounts(db).then(
      (rows) => {
        if (!cancelled) setAccounts(rows);
      },
      (error: unknown) => {
        if (!cancelled) setAccountsError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    listPeriodVouchers(db, periodId).then(
      (rows) => {
        if (!cancelled) setVouchers(rows);
      },
      (error: unknown) => {
        if (!cancelled) setVouchersError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, periodId]);

  /** Re-reads the period's vouchers after a post — success or a draft left behind. */
  async function reloadVouchers() {
    try {
      setVouchers(await listPeriodVouchers(db, periodId));
      setVouchersError(null);
    } catch (error: unknown) {
      setVouchersError(errorMessage(error));
    }
  }

  function setHeaderField<K extends keyof VoucherHeaderForm>(key: K, value: VoucherHeaderForm[K]) {
    setLastPosted(null);
    setPostError(null);
    setHeader((prev) => {
      if (key === "book") {
        const book = value as JournalBook;
        // A book that no longer needs check details shouldn't carry stale ones forward.
        return needsCheckDetails(book) ? { ...prev, book } : { ...prev, book, checkNo: "", checkDate: "" };
      }
      return { ...prev, [key]: value };
    });
  }

  function updateLine(key: string, patch: Partial<VoucherLineForm>) {
    setLastPosted(null);
    setPostError(null);
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLastPosted(null);
    setPostError(null);
    setLines((prev) => [...prev, emptyLine(newLineKey())]);
  }

  function removeLine(key: string) {
    setLastPosted(null);
    setPostError(null);
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  /**
   * Create-then-post, in one call from the button's point of view.
   *
   * `postNewVoucher` is two write batches underneath (D30 forbids one
   * interactive transaction across them). If posting fails after the draft
   * landed, `errorMessage` surfaces `VoucherNotPostedError`'s own sentence —
   * which already says the draft was kept — and `reloadVouchers` is what
   * makes that true: the orphan draft shows up in the table below instead of
   * disappearing.
   */
  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      const draftLines = toDraftLines(lines);
      const result = await postNewVoucher(db, {
        barangayId,
        periodId,
        entryDate: header.entryDate,
        book: header.book,
        particulars: header.particulars,
        checkNo: header.checkNo,
        checkDate: header.checkDate,
        lines: draftLines,
      });
      setLastPosted(result);
      setHeader(emptyHeader(periodStartDate(year, month)));
      setLines([emptyLine(newLineKey()), emptyLine(newLineKey())]);
      await reloadVouchers();
    } catch (error: unknown) {
      setPostError(errorMessage(error));
      await reloadVouchers();
    } finally {
      setPosting(false);
    }
  }

  function startVoid(entryId: number) {
    setVoidingEntryId(entryId);
    setVoidReason("");
    setVoidReversalDate(defaultDateInPeriod(year, month));
    setVoidError(null);
  }

  function cancelVoid() {
    setVoidingEntryId(null);
    setVoidReason("");
    setVoidReversalDate("");
    setVoidError(null);
  }

  /** Void the entry the confirm form is open on, then reload so both the voided original and its reversal show up. */
  async function confirmVoid() {
    if (voidingEntryId === null) return;
    setVoiding(true);
    setVoidError(null);
    try {
      await voidPostedVoucher(db, {
        entryId: voidingEntryId,
        reason: voidReason,
        reversalDate: voidReversalDate,
        periodId,
      });
      cancelVoid();
      await reloadVouchers();
    } catch (error: unknown) {
      setVoidError(errorMessage(error));
    } finally {
      setVoiding(false);
    }
  }

  const accountsLoaded = accounts !== null;
  const vouchersLoaded = vouchers !== null;

  const accountOptions: SelectOption[] = (accounts ?? []).map((a) => ({
    value: String(a.id),
    label: accountLabel(a),
  }));

  const totalsNow = voucherTotals(lines);
  const problems = voucherProblems(header, lines, { year, month, status });
  const postable = problems.length === 0 && !posting;

  const periodTotals = vouchers ? summarisePeriod(vouchers) : null;

  const tableRows = (vouchers ?? []).flatMap((voucher) =>
    voucher.lines.map((line) => ({
      key: `${voucher.entryId}-${line.lineNo}`,
      entryId: voucher.entryId,
      lineNo: line.lineNo,
      date: voucher.entryDate,
      jevNo: voucher.jevNo,
      particulars: voucher.particulars,
      status: voucher.status,
      accountLabel: accountLabel({ code: line.accountCode, name: line.accountName }),
      debitCentavos: line.debitCentavos,
      creditCentavos: line.creditCentavos,
    })),
  );

  return (
    <>
      <div className="jr-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back / Home
        </button>
        <div className="badges">
          <Badge icon={<BuildingIcon />}>{barangayName}</Badge>
          <Badge icon={<CalendarIcon />}>{year}</Badge>
          <Badge icon={<CalendarDaysIcon />}>{monthLabel(month)}</Badge>
          <Badge tone={status === "open" ? "open" : "closed"}>
            {status === "open" ? "Open for posting" : "Closed"}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onViewReports}>
            <BarChartIcon size={14} /> View reports
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenFixedAssets}>
            <BoxIcon size={14} /> Fixed assets
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenAdvances}>
            <WalletIcon size={14} /> Advances
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenBankReconciliation}>
            <BankIcon size={14} /> Bank reconciliation
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenSignatories}>
            <SignatureIcon size={14} /> Signatories
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenChartOfAccounts}>
            <ListIcon size={14} /> Chart of accounts
          </Button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="lbl">
            <WalletIcon size={15} /> Total Debits (posted)
          </div>
          <div className="val">{periodTotals ? formatPeso(periodTotals.postedDebitCentavos) : "…"}</div>
        </div>
        <div className="stat-card">
          <div className="lbl">
            <WalletIcon size={15} /> Total Credits (posted)
          </div>
          <div className="val">{periodTotals ? formatPeso(periodTotals.postedCreditCentavos) : "…"}</div>
        </div>
        <div className="stat-card">
          <div className="lbl">
            <CheckIcon size={15} /> Vouchers
          </div>
          <div className="val">{periodTotals ? `${periodTotals.postedCount} posted` : "…"}</div>
          <div className="sub2">
            {periodTotals ? `${periodTotals.draftCount} draft · ${periodTotals.voidedCount} voided` : ""}
          </div>
        </div>
      </div>

      <Card title="New voucher" subtitle="Compose a balanced voucher for this period.">
        {accountsError ? <p className="form-error">Accounts could not be read. {accountsError}</p> : null}

        <div className="field-row">
          <TextField
            label="Date"
            type="date"
            value={header.entryDate}
            onChange={(v) => setHeaderField("entryDate", v)}
            min={periodStartDate(year, month)}
            max={periodEndDate(year, month)}
          />
          <Select
            label="Book"
            placeholder="Choose book"
            value={header.book}
            options={BOOK_OPTIONS}
            onChange={(v) => setHeaderField("book", v as JournalBook)}
          />
          <TextField
            label="Particulars"
            value={header.particulars}
            onChange={(v) => setHeaderField("particulars", v)}
            placeholder="e.g. Payment of office supplies"
          />
        </div>

        {needsCheckDetails(header.book) ? (
          <div className="field-row voucher-check-row">
            <TextField
              label="Check number"
              value={header.checkNo}
              onChange={(v) => setHeaderField("checkNo", v)}
              placeholder="e.g. 0001234"
            />
            <TextField
              label="Check date"
              type="date"
              value={header.checkDate}
              onChange={(v) => setHeaderField("checkDate", v)}
            />
          </div>
        ) : null}

        <div className="voucher-lines">
          <div className="voucher-line-head">
            <span>Account</span>
            <span>Debit / Credit</span>
            <span>Amount</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div className="voucher-line-row" key={line.key}>
              <Select
                label={`Line ${index + 1} account`}
                hideLabel
                placeholder={accountsLoaded ? "Choose account" : "Loading accounts…"}
                value={line.accountId}
                options={accountOptions}
                onChange={(v) => updateLine(line.key, { accountId: v })}
                disabled={!accountsLoaded}
              />
              <div className="toggle">
                <button
                  type="button"
                  className={line.side === "debit" ? "active" : undefined}
                  onClick={() => updateLine(line.key, { side: "debit" })}
                >
                  Debit
                </button>
                <button
                  type="button"
                  className={line.side === "credit" ? "active" : undefined}
                  onClick={() => updateLine(line.key, { side: "credit" })}
                >
                  Credit
                </button>
              </div>
              <TextField
                label={`Line ${index + 1} amount`}
                hideLabel
                value={line.amount}
                onChange={(v) => updateLine(line.key, { amount: v })}
                prefix="₱"
                inputMode="decimal"
                figure
                placeholder="0.00"
              />
              <button
                type="button"
                className="voucher-line-remove"
                onClick={() => removeLine(line.key)}
                aria-label={`Remove line ${index + 1}`}
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addLine}>
            <PlusIcon size={14} /> Add line
          </Button>
        </div>

        <div className="voucher-totals">
          <div className="total-item">
            <div className="lbl">Total debits</div>
            <div className="val">{formatPeso(totalsNow.debitCentavos)}</div>
          </div>
          <div className="total-item">
            <div className="lbl">Total credits</div>
            <div className="val">{formatPeso(totalsNow.creditCentavos)}</div>
          </div>
          <div className={`total-item ${totalsNow.balanced ? "balanced" : "unbalanced"}`}>
            <div className="lbl">Difference</div>
            <div className="val">{formatPeso(totalsNow.differenceCentavos)}</div>
          </div>
        </div>

        <div className="voucher-actions">
          {problems.length > 0 ? (
            <ul className="voucher-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {postError ? <p className="form-error">{postError}</p> : null}
          {lastPosted ? (
            <p className="form-success">
              <CheckIcon size={14} /> Voucher {lastPosted.jevNo} posted.
            </p>
          ) : null}
          <Button
            variant="dark"
            disabled={!postable}
            onClick={() => {
              void post();
            }}
          >
            {posting ? "Posting…" : "Post →"}
          </Button>
        </div>
      </Card>

      {vouchersError ? <p className="form-error">The period's vouchers could not be read. {vouchersError}</p> : null}
      {voidError ? <p className="form-error">{voidError}</p> : null}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Status</th>
                <th>Particulars</th>
                <th>Account</th>
                <th style={{ textAlign: "right" }}>Debit</th>
                <th style={{ textAlign: "right" }}>Credit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length > 0 ? (
                tableRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.date}</td>
                    <td>{row.jevNo ?? "—"}</td>
                    <td>
                      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    </td>
                    <td>{row.particulars}</td>
                    <td style={{ color: "var(--muted)" }}>{row.accountLabel}</td>
                    <td className="num">{row.debitCentavos ? formatPeso(row.debitCentavos) : "—"}</td>
                    <td className="num">{row.creditCentavos ? formatPeso(row.creditCentavos) : "—"}</td>
                    <td className="voucher-void-cell">
                      {row.lineNo === 1 && row.status === "posted" ? (
                        status === "closed" ? (
                          <p className="voucher-void-closed">
                            This period is closed — void by reopening the period first.
                          </p>
                        ) : voidingEntryId === row.entryId ? (
                          <div className="voucher-void-form">
                            <TextField
                              label={`Reason for voiding ${row.jevNo ?? "this voucher"}`}
                              hideLabel
                              value={voidReason}
                              onChange={setVoidReason}
                              placeholder="Reason for voiding (required)"
                              disabled={voiding}
                            />
                            <TextField
                              label={`Reversal date for ${row.jevNo ?? "this voucher"}`}
                              hideLabel
                              type="date"
                              value={voidReversalDate}
                              onChange={setVoidReversalDate}
                              min={periodStartDate(year, month)}
                              max={periodEndDate(year, month)}
                              disabled={voiding}
                            />
                            <div className="voucher-void-actions">
                              <Button variant="ghost" size="sm" onClick={cancelVoid} disabled={voiding}>
                                Cancel
                              </Button>
                              <Button
                                variant="dark"
                                size="sm"
                                onClick={() => {
                                  void confirmVoid();
                                }}
                                disabled={
                                  voiding ||
                                  voidReason.trim() === "" ||
                                  !isWithinPeriod(voidReversalDate, year, month)
                                }
                              >
                                {voiding ? "Voiding…" : "Confirm void"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => startVoid(row.entryId)}>
                            Void
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty-row">
                    {vouchersLoaded
                      ? `No vouchers recorded for ${formatPeriodLabel(year, month)} — post the first one above.`
                      : "Loading vouchers…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
