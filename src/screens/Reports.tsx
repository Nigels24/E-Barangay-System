import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { ArrowLeftIcon, BuildingIcon, CalendarDaysIcon, CalendarIcon } from "../components/icons";
import { formatIsoDateLong, monthLabel } from "../lib/calendar";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { accountLabel, listPostableAccounts, type AccountOption } from "../lib/queries/accounts";
import { buildGeneralLedger, type GeneralLedgerResult } from "../lib/reports/generalLedger";
import { buildTrialBalance, type TrialBalanceResult } from "../lib/reports/trialBalance";
import { signedBalance } from "../lib/reports/display";
import { formatPeso, formatPesoPlain } from "../lib/money";
import "./Reports.css";

interface ReportsProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  year: number;
  month: number;
  onBack: () => void;
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
export function Reports({ db, barangayId, barangayName, year, month, onBack }: ReportsProps) {
  const [view, setView] = useState<"trial" | "ledger">("trial");

  const [tb, setTb] = useState<TrialBalanceResult | null>(null);
  const [tbError, setTbError] = useState<string | null>(null);

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
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        {tb ? (
          <p className="hint">
            As of {formatIsoDateLong(tb.asOfDate)} — cumulative from inception, not just this
            month&rsquo;s activity. Amounts in Philippine Peso (₱).
          </p>
        ) : null}
      </Card>

      {view === "trial" ? (
        <TrialBalanceView tb={tb} tbError={tbError} />
      ) : (
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
        />
      )}
    </>
  );
}

function TrialBalanceView({ tb, tbError }: { tb: TrialBalanceResult | null; tbError: string | null }) {
  if (tbError) return <p className="form-error">The trial balance could not be read. {tbError}</p>;
  if (!tb) return <p className="hint">Loading the trial balance…</p>;

  const hasProvisional = tb.rows.some((row) => row.isProvisionalCode);

  return (
    <>
      {tb.rows.length === 0 ? (
        <div className="table-card">
          <p className="empty-row">No posted activity for this barangay through this period.</p>
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
      <SignatureBlock />
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
      <SignatureBlock />
    </>
  );
}

const SIGNATORY_LABELS = ["Prepared by", "Certified by", "Approved by"];

/**
 * D25 — signatories are data, per barangay and per report, and nothing has
 * ever written a row to the `signatory` table (no seed, no admin screen yet —
 * Phase 5). Rather than invent a name the way D32 accepted for an internal
 * audit actor, an official government report gets a blank line to sign on:
 * a role label and a rule, nothing pretending to be a real signature.
 */
function SignatureBlock() {
  return (
    <div className="signature-block">
      {SIGNATORY_LABELS.map((label) => (
        <div className="signature-line" key={label}>
          <div className="sig-rule" />
          <div className="sig-role">{label}</div>
        </div>
      ))}
    </div>
  );
}
