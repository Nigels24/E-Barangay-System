import { Fragment, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { ArrowLeftIcon, BuildingIcon, CalendarDaysIcon, CalendarIcon } from "../components/icons";
import { formatIsoDateLong, monthLabel, periodEndDate } from "../lib/calendar";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { accountLabel, listPostableAccounts, type AccountOption } from "../lib/queries/accounts";
import { buildBankReconciliationStatement, type BankReconciliationStatementResult } from "../lib/reports/bankReconciliationStatement";
import { buildFixedAssetSchedule, type FixedAssetScheduleResult } from "../lib/reports/fixedAssetSchedule";
import { buildGeneralJournal, type GeneralJournalResult } from "../lib/reports/generalJournal";
import { buildGeneralLedger, type GeneralLedgerResult } from "../lib/reports/generalLedger";
import { buildScheduleOfAdvances, type ScheduleOfAdvancesResult } from "../lib/reports/scheduleOfAdvances";
import { getEffectiveSignatories, type EffectiveSignatories } from "../lib/reports/signatories";
import { buildTrialBalance, type TrialBalanceResult } from "../lib/reports/trialBalance";
import { reconcilingItemTypeLabel, signedBalance } from "../lib/reports/display";
import { formatPeso, formatPesoPlain } from "../lib/money";
import { SIGNATORY_ROLE_OPTIONS } from "../lib/signatoryForm";
import "./Reports.css";

export type ReportsView = "trial" | "ledger" | "journal" | "assets" | "advances" | "bankrec";

/**
 * The report's own name for the printed page (`.print-title` in
 * Reports.css) — never the button label verbatim, since "Trial Balance"
 * reads fine as a tab but "Fixed Assets" is not what the document itself is
 * titled.
 */
const REPORT_TITLES: Record<ReportsView, string> = {
  trial: "Trial Balance",
  ledger: "General Ledger",
  journal: "General Journal",
  assets: "Fixed Asset Register and Depreciation Schedule",
  advances: "Schedule of Advances to Officers and Employees",
  bankrec: "Bank Reconciliation Statement",
};

interface ReportsProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  year: number;
  month: number;
  onBack: () => void;
  /** Which tab shows first — defaults to Trial Balance, the screen's original entry point. */
  initialView?: ReportsView;
}

/**
 * Trial Balance and General Ledger, sharing one screen shell.
 *
 * Both reports are read-only and both come straight from
 * `src/lib/reports/{trialBalance,generalLedger}.ts` — computed from posted
 * `journal_entry_line` rows, never a stored copy (D18), so the two can never
 * disagree with each other or with the voucher screen. This component holds
 * which tab is showing and which account is picked; every figure on it comes
 * from those two functions unchanged.
 */
export function Reports({ db, barangayId, barangayName, year, month, onBack, initialView }: ReportsProps) {
  const [view, setView] = useState<ReportsView>(initialView ?? "trial");

  const [tb, setTb] = useState<TrialBalanceResult | null>(null);
  const [tbError, setTbError] = useState<string | null>(null);

  const [gj, setGj] = useState<GeneralJournalResult | null>(null);
  const [gjError, setGjError] = useState<string | null>(null);

  const [fa, setFa] = useState<FixedAssetScheduleResult | null>(null);
  const [faError, setFaError] = useState<string | null>(null);

  const [soa, setSoa] = useState<ScheduleOfAdvancesResult | null>(null);
  const [soaError, setSoaError] = useState<string | null>(null);

  const [br, setBr] = useState<BankReconciliationStatementResult | null>(null);
  const [brError, setBrError] = useState<string | null>(null);

  const [signatories, setSignatories] = useState<EffectiveSignatories | null>(null);

  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [ledgerAccountId, setLedgerAccountId] = useState("");
  const [gl, setGl] = useState<GeneralLedgerResult | null>(null);
  const [glLoading, setGlLoading] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildTrialBalance(db, barangayId, year, month).then(
      (result) => {
        if (!cancelled) setTb(result);
      },
      (error: unknown) => {
        if (!cancelled) setTbError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

  useEffect(() => {
    let cancelled = false;
    buildGeneralJournal(db, barangayId, year, month).then(
      (result) => {
        if (!cancelled) setGj(result);
      },
      (error: unknown) => {
        if (!cancelled) setGjError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

  useEffect(() => {
    let cancelled = false;
    buildFixedAssetSchedule(db, barangayId, year, month).then(
      (result) => {
        if (!cancelled) setFa(result);
      },
      (error: unknown) => {
        if (!cancelled) setFaError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

  useEffect(() => {
    let cancelled = false;
    buildScheduleOfAdvances(db, barangayId, year, month).then(
      (result) => {
        if (!cancelled) setSoa(result);
      },
      (error: unknown) => {
        if (!cancelled) setSoaError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

  useEffect(() => {
    let cancelled = false;
    buildBankReconciliationStatement(db, barangayId, year, month).then(
      (result) => {
        if (!cancelled) setBr(result);
      },
      (error: unknown) => {
        if (!cancelled) setBrError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

  useEffect(() => {
    let cancelled = false;
    // No error state here deliberately: a signatory row that can't be read
    // degrades to the same blank-line rendering D25 already requires when
    // none exists, not a report-blocking failure.
    getEffectiveSignatories(db, barangayId, periodEndDate(year, month)).then(
      (result) => {
        if (!cancelled) setSignatories(result);
      },
      () => {
        /* leave signatories null — SignatureBlock renders blank lines, same as D25's no-row case */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, year, month]);

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
    if (ledgerAccountId === "") {
      setGl(null);
      setGlError(null);
      setGlLoading(false);
      return;
    }
    let cancelled = false;
    setGlLoading(true);
    setGlError(null);
    setGl(null);
    buildGeneralLedger(db, barangayId, Number(ledgerAccountId), year, month).then(
      (result) => {
        if (!cancelled) {
          setGl(result);
          setGlLoading(false);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setGlError(errorMessage(error));
          setGlLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId, ledgerAccountId, year, month]);

  const accountOptions: SelectOption[] = (accounts ?? []).map((a) => ({
    value: String(a.id),
    label: accountLabel(a),
  }));
  const selectedAccount = accounts?.find((a) => String(a.id) === ledgerAccountId) ?? null;

  return (
    <>
      <div className="report-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
        <div className="badges">
          <Badge icon={<BuildingIcon />}>{barangayName}</Badge>
          <Badge icon={<CalendarIcon />}>{year}</Badge>
          <Badge icon={<CalendarDaysIcon />}>{monthLabel(month)}</Badge>
        </div>
      </div>

      <Card className="report-toolbar">
        <div className="print-title">
          <h2>{REPORT_TITLES[view]}</h2>
          <p>{barangayName}</p>
        </div>
        <div className="report-toolbar-row">
          <div className="report-tabs">
            <button
              type="button"
              className={view === "trial" ? "active" : undefined}
              onClick={() => setView("trial")}
            >
              Trial Balance
            </button>
            <button
              type="button"
              className={view === "ledger" ? "active" : undefined}
              onClick={() => setView("ledger")}
            >
              General Ledger
            </button>
            <button
              type="button"
              className={view === "journal" ? "active" : undefined}
              onClick={() => setView("journal")}
            >
              General Journal
            </button>
            <button
              type="button"
              className={view === "assets" ? "active" : undefined}
              onClick={() => setView("assets")}
            >
              Fixed Assets
            </button>
            <button
              type="button"
              className={view === "advances" ? "active" : undefined}
              onClick={() => setView("advances")}
            >
              Schedule of Advances
            </button>
            <button
              type="button"
              className={view === "bankrec" ? "active" : undefined}
              onClick={() => setView("bankrec")}
            >
              Bank Reconciliation
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        {view !== "journal" && view !== "assets" && view !== "advances" && view !== "bankrec" && tb ? (
          <p className="hint">
            As of {formatIsoDateLong(tb.asOfDate)} — cumulative from inception, not just this
            month&rsquo;s activity. Amounts in Philippine Peso (₱).
          </p>
        ) : null}
        {view === "journal" ? (
          <p className="hint">
            {monthLabel(month)} {year} only — the General Journal book (GJ). Amounts in
            Philippine Peso (₱).
          </p>
        ) : null}
        {view === "assets" && fa ? (
          <p className="hint">
            As of {formatIsoDateLong(fa.asOfDate)} — assets held as of this date; a disposed
            asset drops off. Independent of the ledger (D21) — see the variance table below.
            Amounts in Philippine Peso (₱).
          </p>
        ) : null}
        {view === "advances" && soa ? (
          <p className="hint">
            As of {formatIsoDateLong(soa.asOfDate)} — advances still outstanding as of now, granted
            on or before this date; a fully liquidated advance drops off. Independent of the
            ledger, same as Fixed Assets. Amounts in Philippine Peso (₱).
          </p>
        ) : null}
        {view === "bankrec" && br ? (
          <p className="hint">
            As of {formatIsoDateLong(br.asOfDate)} — every bank account on file, with this
            month&rsquo;s worksheet if one has been started (D1-D8). Amounts in Philippine Peso
            (₱).
          </p>
        ) : null}
      </Card>

      {view === "trial" ? (
        <TrialBalanceView tb={tb} tbError={tbError} signatories={signatories} />
      ) : view === "ledger" ? (
        <GeneralLedgerView
          accountsLoaded={accounts !== null}
          accountsError={accountsError}
          accountOptions={accountOptions}
          ledgerAccountId={ledgerAccountId}
          onChangeAccount={setLedgerAccountId}
          gl={gl}
          glLoading={glLoading}
          glError={glError}
          selectedAccount={selectedAccount}
          signatories={signatories}
        />
      ) : view === "journal" ? (
        <GeneralJournalView gj={gj} gjError={gjError} signatories={signatories} />
      ) : view === "assets" ? (
        <FixedAssetScheduleView fa={fa} faError={faError} signatories={signatories} />
      ) : view === "advances" ? (
        <ScheduleOfAdvancesView soa={soa} soaError={soaError} signatories={signatories} />
      ) : (
        <BankReconciliationStatementView br={br} brError={brError} signatories={signatories} />
      )}
    </>
  );
}

function TrialBalanceView({
  tb,
  tbError,
  signatories,
}: {
  tb: TrialBalanceResult | null;
  tbError: string | null;
  signatories: EffectiveSignatories | null;
}) {
  if (tbError) return <p className="form-error">The trial balance could not be read. {tbError}</p>;
  if (!tb) return <p className="hint">Loading the trial balance…</p>;

  const hasProvisional = tb.rows.some((row) => row.isProvisionalCode);

  return (
    <>
      {tb.rows.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">
            {tb.hasPostedLines
              ? "Every account nets to zero through this period. See the General Ledger for the posted activity."
              : "No posted activity for this barangay through this period."}
          </p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>{row.code}</td>
                    <td>
                      {row.name}
                      {row.isProvisionalCode ? (
                        <Badge tone="provisional">Provisional</Badge>
                      ) : null}
                    </td>
                    <td className="num">
                      {row.debitCentavos ? formatPesoPlain(row.debitCentavos) : "—"}
                    </td>
                    <td className="num">
                      {row.creditCentavos ? formatPesoPlain(row.creditCentavos) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{formatPesoPlain(tb.totalDebitCentavos)}</td>
                  <td className="num">{formatPesoPlain(tb.totalCreditCentavos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {hasProvisional ? (
        <p className="hint">
          <Badge tone="provisional">Provisional</Badge> — account code not yet confirmed by the
          City Accountant (D12). The balance shown is real; only the code is pending.
        </p>
      ) : null}
      <SignatureBlock signatories={signatories} />
    </>
  );
}

function GeneralLedgerView({
  accountsLoaded,
  accountsError,
  accountOptions,
  ledgerAccountId,
  onChangeAccount,
  gl,
  glLoading,
  glError,
  selectedAccount,
  signatories,
}: {
  accountsLoaded: boolean;
  accountsError: string | null;
  accountOptions: SelectOption[];
  ledgerAccountId: string;
  onChangeAccount: (value: string) => void;
  gl: GeneralLedgerResult | null;
  glLoading: boolean;
  glError: string | null;
  selectedAccount: AccountOption | null;
  signatories: EffectiveSignatories | null;
}) {
  const closing = gl ? signedBalance(gl.closingBalanceCentavos) : null;

  return (
    <>
      <Card className="report-picker">
        <Select
          label="Account"
          placeholder={accountsLoaded ? "Choose an account" : "Loading accounts…"}
          value={ledgerAccountId}
          options={accountOptions}
          onChange={onChangeAccount}
          disabled={!accountsLoaded}
        />
        {accountsError ? (
          <p className="form-error">The chart of accounts could not be read. {accountsError}</p>
        ) : null}
      </Card>

      {selectedAccount ? (
        <p className="report-account-label">Account: {accountLabel(selectedAccount)}</p>
      ) : null}

      {ledgerAccountId === "" ? (
        <p className="hint">Choose an account to view its general ledger.</p>
      ) : glError ? (
        <p className="form-error">The general ledger could not be read. {glError}</p>
      ) : glLoading || !gl ? (
        <p className="hint">Loading…</p>
      ) : gl.rows.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">
            No posted activity for {selectedAccount ? accountLabel(selectedAccount) : "this account"}{" "}
            in this barangay through this period.
          </p>
        </div>
      ) : (
        <>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher No.</th>
                    <th>Particulars</th>
                    <th style={{ textAlign: "right" }}>Debit</th>
                    <th style={{ textAlign: "right" }}>Credit</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {gl.rows.map((row, index) => {
                    const balance = signedBalance(row.balanceCentavos);
                    return (
                      <tr key={`${row.entryId}-${index}`}>
                        <td>{row.entryDate}</td>
                        <td>{row.jevNo ?? "—"}</td>
                        <td>{row.particulars}</td>
                        <td className="num">
                          {row.debitCentavos ? formatPesoPlain(row.debitCentavos) : "—"}
                        </td>
                        <td className="num">
                          {row.creditCentavos ? formatPesoPlain(row.creditCentavos) : "—"}
                        </td>
                        <td className="num">
                          {formatPesoPlain(balance.absCentavos)} {balance.side}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {closing ? (
            <div className="report-closing">
              <span className="lbl">Closing balance</span>
              <span className="val">
                {formatPeso(closing.absCentavos)} {closing.side}
              </span>
            </div>
          ) : null}
        </>
      )}
      <SignatureBlock signatories={signatories} />
    </>
  );
}

function GeneralJournalView({
  gj,
  gjError,
  signatories,
}: {
  gj: GeneralJournalResult | null;
  gjError: string | null;
  signatories: EffectiveSignatories | null;
}) {
  if (gjError) return <p className="form-error">The general journal could not be read. {gjError}</p>;
  if (!gj) return <p className="hint">Loading the general journal…</p>;

  return (
    <>
      {gj.entries.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">No posted General Journal (GJ) activity for this barangay this month.</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher No.</th>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {gj.entries.map((entry) => (
                  <Fragment key={entry.entryId}>
                    <tr>
                      <td>{entry.entryDate}</td>
                      <td>{entry.jevNo ?? "—"}</td>
                      <td colSpan={3} style={{ fontStyle: "italic" }}>
                        {entry.particulars}
                      </td>
                    </tr>
                    {entry.lines.map((line) => (
                      <tr key={`${entry.entryId}-${line.lineNo}`}>
                        <td />
                        <td />
                        <td>
                          {line.accountCode} — {line.accountName}
                        </td>
                        <td className="num">
                          {line.debitCentavos ? formatPesoPlain(line.debitCentavos) : "—"}
                        </td>
                        <td className="num">
                          {line.creditCentavos ? formatPesoPlain(line.creditCentavos) : "—"}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{formatPesoPlain(gj.totalDebitCentavos)}</td>
                  <td className="num">{formatPesoPlain(gj.totalCreditCentavos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <SignatureBlock signatories={signatories} />
    </>
  );
}

function FixedAssetScheduleView({
  fa,
  faError,
  signatories,
}: {
  fa: FixedAssetScheduleResult | null;
  faError: string | null;
  signatories: EffectiveSignatories | null;
}) {
  if (faError) return <p className="form-error">The fixed asset schedule could not be read. {faError}</p>;
  if (!fa) return <p className="hint">Loading the fixed asset schedule…</p>;

  return (
    <>
      {fa.rows.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">No fixed assets held as of this date. Add one from Fixed assets on the period card.</p>
        </div>
      ) : (
        <>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Acquired</th>
                    <th style={{ textAlign: "right" }}>Cost</th>
                    <th style={{ textAlign: "right" }}>Accum. Depreciation</th>
                    <th style={{ textAlign: "right" }}>Book Value</th>
                  </tr>
                </thead>
                <tbody>
                  {fa.rows.map((row) => (
                    <tr key={row.assetId}>
                      <td>{row.category}</td>
                      <td>{row.description}</td>
                      <td>{row.acquisitionDate}</td>
                      <td className="num">{formatPesoPlain(row.costCentavos)}</td>
                      <td className="num">{formatPesoPlain(row.accumulatedDepreciationCentavos)}</td>
                      <td className="num">{formatPesoPlain(row.bookValueCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="num">{formatPesoPlain(fa.totalCostCentavos)}</td>
                    <td className="num">{formatPesoPlain(fa.totalAccumulatedDepreciationCentavos)}</td>
                    <td className="num">{formatPesoPlain(fa.totalBookValueCentavos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category totals</th>
                    <th style={{ textAlign: "right" }}>Cost</th>
                    <th style={{ textAlign: "right" }}>Accum. Depreciation</th>
                    <th style={{ textAlign: "right" }}>Book Value</th>
                  </tr>
                </thead>
                <tbody>
                  {fa.categoryTotals.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="num">{formatPesoPlain(c.costCentavos)}</td>
                      <td className="num">{formatPesoPlain(c.accumulatedDepreciationCentavos)}</td>
                      <td className="num">{formatPesoPlain(c.bookValueCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {fa.costVariance.length > 0 ? (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th colSpan={4}>Register vs. ledger — cost (D21)</th>
                </tr>
                <tr>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Register</th>
                  <th style={{ textAlign: "right" }}>Ledger</th>
                  <th style={{ textAlign: "right" }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {fa.costVariance.map((v) => (
                  <tr key={v.accountId}>
                    <td>
                      {v.accountCode} — {v.accountName}
                    </td>
                    <td className="num">{formatPesoPlain(v.registerCostCentavos)}</td>
                    <td className="num">{formatPesoPlain(v.ledgerBalanceCentavos)}</td>
                    <td className="num">{v.varianceCentavos === 0 ? "—" : formatPesoPlain(v.varianceCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ padding: "0 var(--space-5) var(--space-4)" }}>
            The register and the ledger are built independently (D21) — a variance here is not
            an error to hide, it is something for the accountant to resolve.
          </p>
        </div>
      ) : null}

      <SignatureBlock signatories={signatories} />
    </>
  );
}

function ScheduleOfAdvancesView({
  soa,
  soaError,
  signatories,
}: {
  soa: ScheduleOfAdvancesResult | null;
  soaError: string | null;
  signatories: EffectiveSignatories | null;
}) {
  if (soaError) return <p className="form-error">The schedule of advances could not be read. {soaError}</p>;
  if (!soa) return <p className="hint">Loading the schedule of advances…</p>;

  return (
    <>
      {soa.rows.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">
            No advances outstanding as of this date. Grant one from Advances on the period card.
          </p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date granted</th>
                  <th>Payee</th>
                  <th>Particulars</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "right" }}>Liquidated</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {soa.rows.map((row) => (
                  <tr key={row.advanceId}>
                    <td>{row.dateGranted}</td>
                    <td>{row.payee}</td>
                    <td>{row.particulars}</td>
                    <td className="num">{formatPesoPlain(row.amountCentavos)}</td>
                    <td className="num">{formatPesoPlain(row.liquidatedCentavos)}</td>
                    <td className="num">{formatPesoPlain(row.balanceCentavos)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{formatPesoPlain(soa.totalAmountCentavos)}</td>
                  <td className="num">{formatPesoPlain(soa.totalLiquidatedCentavos)}</td>
                  <td className="num">{formatPesoPlain(soa.totalBalanceCentavos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <SignatureBlock signatories={signatories} />
    </>
  );
}

function BankReconciliationStatementView({
  br,
  brError,
  signatories,
}: {
  br: BankReconciliationStatementResult | null;
  brError: string | null;
  signatories: EffectiveSignatories | null;
}) {
  if (brError) return <p className="form-error">The bank reconciliation statement could not be read. {brError}</p>;
  if (!br) return <p className="hint">Loading the bank reconciliation statement…</p>;

  return (
    <>
      {br.accounts.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">No bank accounts on file for this barangay yet. Add one from Bank Reconciliation on the period card.</p>
        </div>
      ) : (
        br.accounts.map((acct) => (
          <div className="table-card" key={acct.bankAccountId} style={{ marginBottom: "var(--space-5)" }}>
            <div style={{ padding: "var(--space-4) var(--space-5) 0" }}>
              <strong>
                {acct.bankName} — {acct.accountName} ({acct.accountNo})
              </strong>
              <span style={{ color: "var(--muted)" }}>
                {" "}
                · {acct.glAccountCode} — {acct.glAccountName}
              </span>
              {acct.reconciliation ? (
                <Badge tone={acct.reconciliation.status === "final" ? "posted" : "draft"}>
                  {acct.reconciliation.status === "final" ? "Final" : "Draft"}
                </Badge>
              ) : (
                <Badge tone="voided">Not yet reconciled</Badge>
              )}
            </div>

            {acct.reconciliation ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acct.items.length > 0 ? (
                      acct.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.side === "bank" ? "Bank" : "Book"}</td>
                          <td>{reconcilingItemTypeLabel(item.itemType)}</td>
                          <td className="num">{formatPesoPlain(item.amountCentavos)}</td>
                          <td style={{ color: "var(--muted)" }}>{item.explanation ?? "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          No reconciling items.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Statement balance</td>
                      <td className="num">{formatPesoPlain(acct.reconciliation.statementBalanceCentavos)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2}>Adjusted bank balance</td>
                      <td className="num">{formatPesoPlain(acct.adjustedBankBalanceCentavos ?? 0)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2}>Ledger balance (live)</td>
                      <td className="num">{formatPesoPlain(acct.reconciliation.bookBalanceCentavos)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2}>Adjusted book balance</td>
                      <td className="num">{formatPesoPlain(acct.adjustedBookBalanceCentavos ?? 0)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <strong>Variance</strong>
                      </td>
                      <td className="num">
                        <strong>{formatPesoPlain(acct.varianceCentavos ?? 0)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="empty-row">No reconciliation started for this period yet.</p>
            )}
          </div>
        ))
      )}
      <SignatureBlock signatories={signatories} />
    </>
  );
}

/**
 * D25 — signatories are data, per barangay and per report. `signatories`
 * is resolved "as of" this report's own date (`getEffectiveSignatories`,
 * `Reports`' own effect) — a role with no row on file *as of that date*
 * still gets a blank line to sign on here, never an invented name or a
 * placeholder like "TBD" (the same treatment D32 uses for an internal audit
 * actor, applied to an official document instead of an internal one).
 */
function SignatureBlock({ signatories }: { signatories: EffectiveSignatories | null }) {
  return (
    <div className="signature-block">
      {SIGNATORY_ROLE_OPTIONS.map(({ value: role, label }) => {
        const current = signatories?.[role] ?? null;
        return (
          <div className="signature-line" key={role}>
            <div className="sig-rule" />
            {current ? <div className="sig-name">{current.name}</div> : null}
            <div className="sig-role">{current ? `${current.designation} (${label})` : label}</div>
          </div>
        );
      })}
    </div>
  );
}
