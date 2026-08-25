import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { TextField } from "../components/TextField";
import { ArrowLeftIcon, BarChartIcon, BuildingIcon, CheckIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import {
  adjustingEntryProblems,
  bankAccountProblems,
  clearedDateProblems,
  emptyAdjustingEntryForm,
  emptyBankAccountForm,
  emptyReconciliationHeaderForm,
  emptyReconcilingItemForm,
  reconciliationHeaderProblems,
  reconcilingItemProblems,
  reconcilingItemTypesForSide,
  toNewBankAccountInput,
  toNewReconcilingItemInput,
  toReconciliationHeaderCentavos,
  type AdjustingEntryFormState,
  type BankAccountFormState,
  type ReconciliationHeaderFormState,
  type ReconcilingItemFormState,
} from "../lib/bankReconciliationForm";
import { periodEndDate } from "../lib/calendar";
import { accountLabel, listPostableAccounts, type AccountOption } from "../lib/queries/accounts";
import {
  addReconcilingItemAction,
  createBankAccountAction,
  deriveOutstandingChecks,
  finalizeReconciliationAction,
  getReconciliationWorksheet,
  listBankAccounts,
  listBankGlAccounts,
  markCheckClearedAction,
  postAdjustingEntryAction,
  startReconciliationAction,
  updateReconciliationHeaderAction,
  type BankAccountRecord,
  type OutstandingCheckCandidate,
  type ReconciliationWorksheet,
  type WorksheetContext,
} from "../lib/queries/bankReconciliation";
import { formatPeso, formatPesoPlain } from "../lib/money";
import { reconcilingItemTypeLabel } from "../lib/reports/display";
import "./BankReconciliation.css";

interface BankReconciliationProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  periodId: number;
  year: number;
  month: number;
  onBack: () => void;
  onViewStatement: () => void;
}

/**
 * Bank reconciliation (D1-D8): the barangay's bank accounts, and a
 * per-account, per-period worksheet — never a report that just replays
 * posted lines, because D5's whole point is that this worksheet is its own
 * fact, reconciled against the ledger rather than derived from it. The
 * printable Bank Reconciliation Statement that reads this back for the
 * period lives on `Reports.tsx`, same composition/print split every other
 * entry screen in this app keeps.
 */
export function BankReconciliation({
  db,
  barangayId,
  barangayName,
  periodId,
  year,
  month,
  onBack,
  onViewStatement,
}: BankReconciliationProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[] | null>(null);
  const [bankAccountsError, setBankAccountsError] = useState<string | null>(null);

  const [glAccounts, setGlAccounts] = useState<AccountOption[] | null>(null);
  const [glAccountsError, setGlAccountsError] = useState<string | null>(null);

  const [addForm, setAddForm] = useState<BankAccountFormState>(emptyBankAccountForm());
  const [savingAccount, setSavingAccount] = useState(false);
  const [saveAccountError, setSaveAccountError] = useState<string | null>(null);
  const [lastSavedAccount, setLastSavedAccount] = useState<BankAccountRecord | null>(null);

  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  useEffect(() => {
    let cancelled = false;
    listBankAccounts(db, barangayId).then(
      (rows) => {
        if (!cancelled) {
          setBankAccounts(rows);
          if (rows.length === 1) setSelectedBankAccountId(String(rows[0].id));
        }
      },
      (error: unknown) => {
        if (!cancelled) setBankAccountsError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId]);

  useEffect(() => {
    let cancelled = false;
    listBankGlAccounts(db).then(
      (rows) => {
        if (!cancelled) setGlAccounts(rows);
      },
      (error: unknown) => {
        if (!cancelled) setGlAccountsError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  async function reloadBankAccounts() {
    try {
      setBankAccounts(await listBankAccounts(db, barangayId));
      setBankAccountsError(null);
    } catch (error: unknown) {
      setBankAccountsError(errorMessage(error));
    }
  }

  function setAddField<K extends keyof BankAccountFormState>(key: K, value: BankAccountFormState[K]) {
    setLastSavedAccount(null);
    setSaveAccountError(null);
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAccount() {
    setSavingAccount(true);
    setSaveAccountError(null);
    try {
      const created = await createBankAccountAction(db, toNewBankAccountInput(addForm, barangayId));
      setLastSavedAccount(created);
      setAddForm(emptyBankAccountForm());
      await reloadBankAccounts();
      setSelectedBankAccountId(String(created.id));
    } catch (error: unknown) {
      setSaveAccountError(errorMessage(error));
    } finally {
      setSavingAccount(false);
    }
  }

  const glAccountsLoaded = glAccounts !== null;
  const glAccountOptions: SelectOption[] = (glAccounts ?? []).map((a) => ({
    value: String(a.id),
    label: accountLabel(a),
  }));
  const addProblems = bankAccountProblems(addForm);
  const accountSavable = addProblems.length === 0 && !savingAccount;

  const bankAccountsLoaded = bankAccounts !== null;
  const bankAccountOptions: SelectOption[] = (bankAccounts ?? []).map((a) => ({
    value: String(a.id),
    label: `${a.bankName} — ${a.accountName} (${a.accountNo})`,
  }));
  const selectedBankAccount = (bankAccounts ?? []).find((a) => String(a.id) === selectedBankAccountId) ?? null;

  return (
    <>
      <div className="br-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
        <div className="badges">
          <Badge icon={<BuildingIcon />}>{barangayName}</Badge>
          <Button variant="ghost" size="sm" onClick={onViewStatement}>
            <BarChartIcon size={14} /> View statement
          </Button>
        </div>
      </div>

      <Card title="Bank accounts" subtitle="A barangay may keep more than one — General Fund, SK Fund, Trust Fund and so on.">
        {bankAccountsError ? <p className="form-error">Bank accounts could not be read. {bankAccountsError}</p> : null}
        {glAccountsError ? <p className="form-error">The chart of accounts could not be read. {glAccountsError}</p> : null}

        {(bankAccounts ?? []).length > 0 ? (
          <div className="field-row">
            <Select
              label="Working on"
              placeholder={bankAccountsLoaded ? "Choose a bank account" : "Loading…"}
              value={selectedBankAccountId}
              options={bankAccountOptions}
              onChange={setSelectedBankAccountId}
              disabled={!bankAccountsLoaded}
            />
          </div>
        ) : bankAccountsLoaded ? (
          <p className="hint">No bank accounts on file yet for {barangayName} — add the first one below.</p>
        ) : (
          <p className="hint">Loading bank accounts…</p>
        )}

        <div className="br-add-account">
          <p className="br-add-account-title">Add a bank account</p>
          <div className="field-row">
            <TextField label="Bank name" value={addForm.bankName} onChange={(v) => setAddField("bankName", v)} placeholder="e.g. Land Bank of the Philippines" />
            <TextField label="Account number" value={addForm.accountNo} onChange={(v) => setAddField("accountNo", v)} placeholder="e.g. 1234-5678-90" />
            <TextField label="Account name" value={addForm.accountName} onChange={(v) => setAddField("accountName", v)} placeholder="e.g. General Fund" />
            <Select
              label="Cash in Bank ledger account"
              placeholder={glAccountsLoaded ? "Choose the account this controls" : "Loading accounts…"}
              value={addForm.glAccountId}
              options={glAccountOptions}
              onChange={(v) => setAddField("glAccountId", v)}
              disabled={!glAccountsLoaded}
            />
          </div>
          <div className="br-actions">
            {addProblems.length > 0 ? (
              <ul className="br-problems">
                {addProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {saveAccountError ? <p className="form-error">{saveAccountError}</p> : null}
            {lastSavedAccount ? (
              <p className="form-success">
                <CheckIcon size={14} /> {lastSavedAccount.bankName} added.
              </p>
            ) : null}
            <Button
              variant="dark"
              size="sm"
              disabled={!accountSavable}
              onClick={() => {
                void saveAccount();
              }}
            >
              {savingAccount ? "Saving…" : "Add bank account →"}
            </Button>
          </div>
        </div>
      </Card>

      {selectedBankAccount ? (
        <ReconciliationWorksheetSection
          key={selectedBankAccount.id}
          db={db}
          barangayId={barangayId}
          periodId={periodId}
          year={year}
          month={month}
          bankAccount={selectedBankAccount}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The worksheet for one bank account, one period                       */
/* ------------------------------------------------------------------ */

const ITEM_TYPE_LABEL_OPTIONS = (side: "bank" | "book"): SelectOption[] =>
  reconcilingItemTypesForSide(side).map((t) => ({ value: t, label: reconcilingItemTypeLabel(t) }));

function ReconciliationWorksheetSection({
  db,
  barangayId,
  periodId,
  year,
  month,
  bankAccount,
}: {
  db: EngineDb;
  barangayId: number;
  periodId: number;
  year: number;
  month: number;
  bankAccount: BankAccountRecord;
}) {
  const context: WorksheetContext = {
    bankAccountId: bankAccount.id,
    periodId,
    barangayId,
    glAccountId: bankAccount.glAccountId,
    year,
    month,
  };

  const [worksheet, setWorksheet] = useState<ReconciliationWorksheet | null | undefined>(undefined);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);

  const [startForm, setStartForm] = useState<ReconciliationHeaderFormState>(() =>
    emptyReconciliationHeaderForm(periodEndDate(year, month)),
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState<ReconciliationHeaderFormState>(() =>
    emptyReconciliationHeaderForm(periodEndDate(year, month)),
  );
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState<ReconcilingItemFormState>(emptyReconcilingItemForm());
  const [addingItem, setAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const [checks, setChecks] = useState<OutstandingCheckCandidate[] | null>(null);
  const [checksError, setChecksError] = useState<string | null>(null);
  const [addingCheckEntryId, setAddingCheckEntryId] = useState<number | null>(null);
  const [clearingEntryId, setClearingEntryId] = useState<number | null>(null);
  const [clearDate, setClearDate] = useState("");
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const [adjustingItemId, setAdjustingItemId] = useState<number | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustingEntryFormState>(emptyAdjustingEntryForm(""));
  const [postingAdjustment, setPostingAdjustment] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [lastAdjustment, setLastAdjustment] = useState<string | null>(null);

  const [offsetAccounts, setOffsetAccounts] = useState<AccountOption[] | null>(null);

  const [finalizeConfirming, setFinalizeConfirming] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPostableAccounts(db).then(
      (rows) => {
        if (!cancelled) setOffsetAccounts(rows);
      },
      () => {
        /* surfaced inline where the picker is used */
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  async function reloadChecks(asOfDate: string) {
    try {
      setChecks(await deriveOutstandingChecks(db, barangayId, bankAccount.glAccountId, asOfDate));
      setChecksError(null);
    } catch (error: unknown) {
      setChecksError(errorMessage(error));
    }
  }

  useEffect(() => {
    let cancelled = false;
    getReconciliationWorksheet(db, context).then(
      (result) => {
        if (!cancelled) setWorksheet(result);
      },
      (error: unknown) => {
        if (!cancelled) setWorksheetError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, bankAccount.id, periodId]);

  useEffect(() => {
    if (worksheet && worksheet.reconciliation.status === "draft") {
      void reloadChecks(worksheet.reconciliation.statementDate);
    } else {
      setChecks(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksheet?.reconciliation.id, worksheet?.reconciliation.statementDate, worksheet?.items.length]);

  async function startWorksheet() {
    setStarting(true);
    setStartError(null);
    try {
      const created = await startReconciliationAction(db, {
        context,
        statementDate: startForm.statementDate,
        statementBalanceCentavos: toReconciliationHeaderCentavos(startForm),
      });
      setWorksheet(created);
    } catch (error: unknown) {
      setStartError(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  function beginEditHeader() {
    if (!worksheet) return;
    setHeaderForm({
      statementDate: worksheet.reconciliation.statementDate,
      statementBalance: formatPesoPlain(worksheet.reconciliation.statementBalanceCentavos),
    });
    setEditingHeader(true);
    setHeaderError(null);
  }

  async function saveHeader() {
    if (!worksheet) return;
    setSavingHeader(true);
    setHeaderError(null);
    try {
      const updated = await updateReconciliationHeaderAction(db, {
        context,
        reconciliationId: worksheet.reconciliation.id,
        statementDate: headerForm.statementDate,
        statementBalanceCentavos: toReconciliationHeaderCentavos(headerForm),
      });
      setWorksheet(updated);
      setEditingHeader(false);
    } catch (error: unknown) {
      setHeaderError(errorMessage(error));
    } finally {
      setSavingHeader(false);
    }
  }

  function setItemField<K extends keyof ReconcilingItemFormState>(key: K, value: ReconcilingItemFormState[K]) {
    setAddItemError(null);
    setItemForm((prev) => {
      if (key === "side") {
        const allowed = reconcilingItemTypesForSide(value as "bank" | "book");
        return { ...prev, side: value as "bank" | "book", itemType: allowed[0] };
      }
      return { ...prev, [key]: value };
    });
  }

  async function addItem() {
    if (!worksheet) return;
    setAddingItem(true);
    setAddItemError(null);
    try {
      const updated = await addReconcilingItemAction(db, { context, reconciliationId: worksheet.reconciliation.id, ...toNewReconcilingItemInput(itemForm) });
      setWorksheet(updated);
      setItemForm(emptyReconcilingItemForm());
    } catch (error: unknown) {
      setAddItemError(errorMessage(error));
    } finally {
      setAddingItem(false);
    }
  }

  async function addOutstandingCheck(check: OutstandingCheckCandidate) {
    if (!worksheet) return;
    setAddingCheckEntryId(check.entryId);
    setChecksError(null);
    try {
      const updated = await addReconcilingItemAction(db, {
        context,
        reconciliationId: worksheet.reconciliation.id,
        side: "bank",
        itemType: "checks_issued_not_taken_up",
        amountCentavos: -check.amountCentavos,
        explanation: `Check #${check.checkNo}, issued ${check.checkDate}${check.jevNo ? ` (${check.jevNo})` : ""}`,
        relatedEntryId: check.entryId,
      });
      setWorksheet(updated);
      await reloadChecks(worksheet.reconciliation.statementDate);
    } catch (error: unknown) {
      setChecksError(errorMessage(error));
    } finally {
      setAddingCheckEntryId(null);
    }
  }

  function beginClear(check: OutstandingCheckCandidate) {
    setClearingEntryId(check.entryId);
    setClearDate(worksheet?.reconciliation.statementDate ?? "");
    setClearError(null);
  }

  async function confirmClear() {
    if (clearingEntryId === null || !worksheet) return;
    setClearBusy(true);
    setClearError(null);
    try {
      await markCheckClearedAction(db, { entryId: clearingEntryId, clearedDate: clearDate });
      setClearingEntryId(null);
      setClearDate("");
      await reloadChecks(worksheet.reconciliation.statementDate);
    } catch (error: unknown) {
      setClearError(errorMessage(error));
    } finally {
      setClearBusy(false);
    }
  }

  function beginAdjust(itemId: number) {
    const item = worksheet?.items.find((i) => i.id === itemId);
    setAdjustingItemId(itemId);
    setAdjustForm(
      emptyAdjustingEntryForm(
        item ? `Bank reconciliation adjustment — ${reconcilingItemTypeLabel(item.itemType)}${item.explanation ? `: ${item.explanation}` : ""}` : "",
      ),
    );
    setAdjustError(null);
    setLastAdjustment(null);
  }

  async function postAdjustment() {
    if (adjustingItemId === null || !worksheet) return;
    const item = worksheet.items.find((i) => i.id === adjustingItemId);
    if (!item) return;
    setPostingAdjustment(true);
    setAdjustError(null);
    try {
      const { worksheet: updated, posted } = await postAdjustingEntryAction(db, {
        context,
        reconcilingItemId: item.id,
        itemAmountCentavos: item.amountCentavos,
        entryDate: worksheet.reconciliation.statementDate,
        particulars: adjustForm.particulars,
        offsetAccountId: Number(adjustForm.offsetAccountId),
      });
      setWorksheet(updated);
      setLastAdjustment(`Posted as ${posted.jevNo}.`);
      setAdjustingItemId(null);
    } catch (error: unknown) {
      setAdjustError(errorMessage(error));
    } finally {
      setPostingAdjustment(false);
    }
  }

  async function finalize() {
    if (!worksheet) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const updated = await finalizeReconciliationAction(db, {
        context,
        reconciliationId: worksheet.reconciliation.id,
        varianceOverrideReason: worksheet.varianceCentavos !== 0 ? overrideReason : undefined,
      });
      setWorksheet(updated);
      setFinalizeConfirming(false);
      setOverrideReason("");
    } catch (error: unknown) {
      setFinalizeError(errorMessage(error));
    } finally {
      setFinalizing(false);
    }
  }

  const offsetAccountsLoaded = offsetAccounts !== null;
  const offsetAccountOptions: SelectOption[] = (offsetAccounts ?? []).map((a) => ({
    value: String(a.id),
    label: accountLabel(a),
  }));

  if (worksheet === undefined) return <p className="hint">Loading the reconciliation…</p>;
  if (worksheetError) return <p className="form-error">The reconciliation could not be read. {worksheetError}</p>;

  if (worksheet === null) {
    const problems = reconciliationHeaderProblems(startForm);
    return (
      <Card
        title={`Start ${bankAccount.bankName}'s reconciliation for this month`}
        subtitle="Keyed in by hand from the bank statement (D3) — nothing here is fetched automatically."
      >
        <div className="field-row">
          <TextField label="Statement date" type="date" value={startForm.statementDate} onChange={(v) => setStartForm((p) => ({ ...p, statementDate: v }))} />
          <TextField
            label="Statement ending balance"
            value={startForm.statementBalance}
            onChange={(v) => setStartForm((p) => ({ ...p, statementBalance: v }))}
            prefix="₱"
            inputMode="decimal"
            figure
            placeholder="0.00"
          />
        </div>
        <div className="br-actions">
          {problems.length > 0 ? (
            <ul className="br-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {startError ? <p className="form-error">{startError}</p> : null}
          <Button
            variant="dark"
            disabled={problems.length > 0 || starting}
            onClick={() => {
              void startWorksheet();
            }}
          >
            {starting ? "Starting…" : "Start reconciliation →"}
          </Button>
        </div>
      </Card>
    );
  }

  const { reconciliation, items, liveBookBalanceCentavos, adjustedBankBalanceCentavos, adjustedBookBalanceCentavos, varianceCentavos } = worksheet;
  const isDraft = reconciliation.status === "draft";
  const reconciled = varianceCentavos === 0;

  return (
    <>
      <Card
        title="Reconciliation worksheet"
        subtitle={isDraft ? "Draft — not yet part of the official record." : "Finalised — the statutory record for this month."}
      >
        <div className="br-summary">
          <div className="br-summary-col">
            <p className="br-summary-title">Bank side</p>
            <div className="br-summary-row">
              <span>Statement balance</span>
              <span className="num">{formatPeso(reconciliation.statementBalanceCentavos)}</span>
            </div>
            <div className="br-summary-row">
              <span>Reconciling items</span>
              <span className="num">{formatPeso(adjustedBankBalanceCentavos - reconciliation.statementBalanceCentavos)}</span>
            </div>
            <div className="br-summary-row br-summary-total">
              <span>Adjusted bank balance</span>
              <span className="num">{formatPeso(adjustedBankBalanceCentavos)}</span>
            </div>
          </div>
          <div className="br-summary-col">
            <p className="br-summary-title">Book side</p>
            <div className="br-summary-row">
              <span>Ledger balance (live)</span>
              <span className="num">{formatPeso(liveBookBalanceCentavos)}</span>
            </div>
            <div className="br-summary-row">
              <span>Reconciling items</span>
              <span className="num">{formatPeso(adjustedBookBalanceCentavos - liveBookBalanceCentavos)}</span>
            </div>
            <div className="br-summary-row br-summary-total">
              <span>Adjusted book balance</span>
              <span className="num">{formatPeso(adjustedBookBalanceCentavos)}</span>
            </div>
          </div>
        </div>

        <div className={`br-variance ${reconciled ? "is-clean" : "is-off"}`}>
          <span>Variance</span>
          <span className="num">{formatPeso(varianceCentavos)}</span>
          {reconciled ? <Badge tone="posted">Reconciled</Badge> : <Badge tone="voided">Not reconciled</Badge>}
        </div>

        {isDraft ? (
          editingHeader ? (
            <div className="br-edit-header">
              <div className="field-row">
                <TextField label="Statement date" type="date" value={headerForm.statementDate} onChange={(v) => setHeaderForm((p) => ({ ...p, statementDate: v }))} />
                <TextField
                  label="Statement ending balance"
                  value={headerForm.statementBalance}
                  onChange={(v) => setHeaderForm((p) => ({ ...p, statementBalance: v }))}
                  prefix="₱"
                  inputMode="decimal"
                  figure
                />
              </div>
              {headerError ? <p className="form-error">{headerError}</p> : null}
              <div className="br-actions">
                <Button variant="ghost" size="sm" onClick={() => setEditingHeader(false)} disabled={savingHeader}>
                  Cancel
                </Button>
                <Button
                  variant="dark"
                  size="sm"
                  onClick={() => {
                    void saveHeader();
                  }}
                  disabled={savingHeader || reconciliationHeaderProblems(headerForm).length > 0}
                >
                  {savingHeader ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={beginEditHeader}>
              Correct statement date / balance
            </Button>
          )
        ) : null}
      </Card>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Explanation</th>
                <th>Adjusting entry</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Badge tone={item.side === "bank" ? "outline" : "provisional"}>{item.side === "bank" ? "Bank" : "Book"}</Badge>
                    </td>
                    <td>{reconcilingItemTypeLabel(item.itemType)}</td>
                    <td className="num">{formatPeso(item.amountCentavos)}</td>
                    <td style={{ color: "var(--muted)" }}>{item.explanation ?? "—"}</td>
                    <td className="br-adjust-cell">
                      {item.side !== "book" ? (
                        "—"
                      ) : item.adjustingEntryId !== null ? (
                        <Badge tone="posted">Posted</Badge>
                      ) : !isDraft ? (
                        "—"
                      ) : adjustingItemId === item.id ? (
                        <div className="br-adjust-form">
                          <Select
                            label="Offset account"
                            hideLabel
                            placeholder={offsetAccountsLoaded ? "Choose the other account" : "Loading…"}
                            value={adjustForm.offsetAccountId}
                            options={offsetAccountOptions}
                            onChange={(v) => setAdjustForm((p) => ({ ...p, offsetAccountId: v }))}
                            disabled={!offsetAccountsLoaded}
                          />
                          <TextField
                            label="Particulars"
                            hideLabel
                            value={adjustForm.particulars}
                            onChange={(v) => setAdjustForm((p) => ({ ...p, particulars: v }))}
                          />
                          {adjustError ? <p className="form-error">{adjustError}</p> : null}
                          <div className="br-actions">
                            <Button variant="ghost" size="sm" onClick={() => setAdjustingItemId(null)} disabled={postingAdjustment}>
                              Cancel
                            </Button>
                            <Button
                              variant="dark"
                              size="sm"
                              onClick={() => {
                                void postAdjustment();
                              }}
                              disabled={postingAdjustment || adjustingEntryProblems(adjustForm).length > 0}
                            >
                              {postingAdjustment ? "Posting…" : "Post adjusting entry →"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => beginAdjust(item.id)}>
                          Create adjusting entry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No reconciling items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {lastAdjustment ? (
        <p className="form-success">
          <CheckIcon size={14} /> {lastAdjustment}
        </p>
      ) : null}

      {isDraft ? (
        <Card title="Add a reconciling item" subtitle="A fixed category list (D4), plus Other for anything else.">
          <div className="field-row">
            <div className="toggle">
              <button type="button" className={itemForm.side === "bank" ? "active" : undefined} onClick={() => setItemField("side", "bank")}>
                Bank side
              </button>
              <button type="button" className={itemForm.side === "book" ? "active" : undefined} onClick={() => setItemField("side", "book")}>
                Book side
              </button>
            </div>
            <Select
              label="Type"
              placeholder="Choose a category"
              value={itemForm.itemType}
              options={ITEM_TYPE_LABEL_OPTIONS(itemForm.side)}
              onChange={(v) => setItemField("itemType", v as ReconcilingItemFormState["itemType"])}
            />
            <TextField
              label="Amount"
              value={itemForm.amount}
              onChange={(v) => setItemField("amount", v)}
              prefix="₱"
              inputMode="decimal"
              figure
              placeholder="-500.00"
            />
            <TextField label="Explanation" value={itemForm.explanation} onChange={(v) => setItemField("explanation", v)} placeholder="Optional" />
          </div>
          <div className="br-actions">
            {reconcilingItemProblems(itemForm).length > 0 ? (
              <ul className="br-problems">
                {reconcilingItemProblems(itemForm).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {addItemError ? <p className="form-error">{addItemError}</p> : null}
            <Button
              variant="dark"
              size="sm"
              disabled={addingItem || reconcilingItemProblems(itemForm).length > 0}
              onClick={() => {
                void addItem();
              }}
            >
              {addingItem ? "Adding…" : "Add item →"}
            </Button>
          </div>
        </Card>
      ) : null}

      {isDraft ? (
        <Card title="Outstanding checks" subtitle="Derived from posted check disbursements, not retyped (D6).">
          {checksError ? <p className="form-error">{checksError}</p> : null}
          {clearError ? <p className="form-error">{clearError}</p> : null}
          {checks === null ? (
            <p className="hint">Loading…</p>
          ) : checks.length === 0 ? (
            <p className="hint">No checks issued against this account are outstanding as of the statement date.</p>
          ) : (
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Check no.</th>
                      <th>Date</th>
                      <th>Voucher</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={c.entryId}>
                        <td>{c.checkNo}</td>
                        <td>{c.checkDate}</td>
                        <td>{c.jevNo ?? "—"}</td>
                        <td className="num">{formatPeso(c.amountCentavos)}</td>
                        <td className="br-check-actions">
                          {clearingEntryId === c.entryId ? (
                            <div className="br-adjust-form">
                              <TextField label="Cleared date" hideLabel type="date" value={clearDate} onChange={setClearDate} min={c.checkDate} />
                              {clearedDateProblems(clearDate, c.checkDate).length > 0 ? (
                                <ul className="br-problems">
                                  {clearedDateProblems(clearDate, c.checkDate).map((p) => (
                                    <li key={p}>{p}</li>
                                  ))}
                                </ul>
                              ) : null}
                              <div className="br-actions">
                                <Button variant="ghost" size="sm" onClick={() => setClearingEntryId(null)} disabled={clearBusy}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="dark"
                                  size="sm"
                                  onClick={() => {
                                    void confirmClear();
                                  }}
                                  disabled={clearBusy || clearedDateProblems(clearDate, c.checkDate).length > 0}
                                >
                                  {clearBusy ? "Saving…" : "Confirm cleared"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  void addOutstandingCheck(c);
                                }}
                                disabled={addingCheckEntryId === c.entryId}
                              >
                                {addingCheckEntryId === c.entryId ? "Adding…" : "Still outstanding"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => beginClear(c)}>
                                Mark cleared
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      <Card title={isDraft ? "Finalize" : "Finalized"}>
        {isDraft ? (
          reconciled ? (
            <div className="br-actions">
              <p className="hint">The bank and book balances agree. This can be finalised.</p>
              <Button
                variant="dark"
                disabled={finalizing}
                onClick={() => {
                  void finalize();
                }}
              >
                {finalizing ? "Finalizing…" : "Finalize →"}
              </Button>
            </div>
          ) : finalizeConfirming ? (
            <div className="br-actions">
              <TextField
                label="Reason for finalizing with a variance (required)"
                hideLabel
                value={overrideReason}
                onChange={setOverrideReason}
                placeholder="Reason for finalizing despite the variance (required)"
              />
              <div className="br-actions">
                <Button variant="ghost" size="sm" onClick={() => setFinalizeConfirming(false)} disabled={finalizing}>
                  Cancel
                </Button>
                <Button
                  variant="dark"
                  size="sm"
                  onClick={() => {
                    void finalize();
                  }}
                  disabled={finalizing || overrideReason.trim() === ""}
                >
                  {finalizing ? "Finalizing…" : "Finalize with override →"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="br-actions">
              <p className="hint">The bank and book balances do not agree (D7). Resolve the variance, or override with a written reason.</p>
              <Button variant="ghost" onClick={() => setFinalizeConfirming(true)}>
                Finalize anyway…
              </Button>
            </div>
          )
        ) : (
          <>
            <p className="hint">
              Finalised {reconciliation.finalisedAt ? new Date(reconciliation.finalisedAt).toLocaleString() : ""}.
            </p>
            {reconciliation.varianceOverrideReason ? (
              <p className="hint">Variance override reason: {reconciliation.varianceOverrideReason}</p>
            ) : null}
          </>
        )}
        {finalizeError ? <p className="form-error">{finalizeError}</p> : null}
      </Card>
    </>
  );
}
