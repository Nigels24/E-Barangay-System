import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { TextField } from "../components/TextField";
import { BuildingIcon, CalendarDaysIcon, CalendarIcon } from "../components/icons";
import { MONTHS, formatPeriodLabel, selectableYears } from "../lib/calendar";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import type { PeriodStatus, UserRole } from "../db/schema";
import { listBarangays, type BarangayOption } from "../lib/queries/barangays";
import {
  closePeriodAction,
  openPeriodSummary,
  periodSummaryById,
  reopenPeriodAction,
  type PeriodSummary,
} from "../lib/queries/periods";
import "./SelectRecords.css";

/**
 * The first screen: choose a barangay, a year and a month, and open that
 * month's books.
 *
 * Deliberately thin. It holds selection state, calls two query functions and
 * renders what they return — every decision worth being wrong about lives in
 * `src/lib/queries/` and `src/lib/calendar.ts`, under vitest. There is no React
 * testing library in this project, so anything that stays in here is verified
 * by eye and nothing more; that is the reason to keep it small, not a matter of
 * taste.
 *
 * The three selects hold **strings**, because that is what a DOM `<select>`
 * gives back and pretending otherwise just moves the conversion somewhere less
 * obvious. They are converted once, at the call boundary, and
 * `openPeriodSummary` rejects anything that did not survive the trip.
 */

/** What `onOpenBooks` hands `App` — everything the journal screen needs, resolved once here. */
export interface OpenedBooks {
  barangayId: number;
  barangayName: string;
  periodId: number;
  year: number;
  month: number;
  status: PeriodStatus;
}

export function SelectRecords({
  db,
  resume,
  currentUserId,
  currentUserRole,
  onOpenBooks,
  onViewReports,
  onOpenFixedAssets,
  onOpenAdvances,
  onOpenBankReconciliation,
  onOpenSignatories,
  onOpenChartOfAccounts,
  onOpenUserAdmin,
}: {
  db: EngineDb;
  /**
   * A period this screen had already opened, handed back by a register's
   * Back button so pressing it returns to the opened card rather than an
   * empty picker. The card is re-read from the database on mount rather
   * than rendered from this payload, so a period closed (or an entry
   * posted) while she was away shows its real current state.
   */
  resume?: OpenedBooks;
  /** The current session's user (T-018/D24) — every write here attributes to them. */
  currentUserId: number;
  /** Gates the Chart of accounts / Manage users links — both Administrator-only (D24). */
  currentUserRole: UserRole;
  onOpenBooks: (opened: OpenedBooks) => void;
  onViewReports: (opened: OpenedBooks) => void;
  onOpenFixedAssets: (opened: OpenedBooks) => void;
  onOpenAdvances: (opened: OpenedBooks) => void;
  onOpenBankReconciliation: (opened: OpenedBooks) => void;
  onOpenSignatories: (opened: OpenedBooks) => void;
  /**
   * Neither screen is barangay-scoped (D9), so neither needs the open
   * period — but both are reachable with one open, and Back from them
   * lands here. Handing the opened books up means that Back can restore
   * this screen instead of resetting it. `null` when nothing is open yet.
   */
  onOpenChartOfAccounts: (opened: OpenedBooks | null) => void;
  onOpenUserAdmin: (opened: OpenedBooks | null) => void;
}) {
  const [barangays, setBarangays] = useState<BarangayOption[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // The selects hold strings (see the module doc), so a resumed selection is
  // converted once, here, rather than leaving the pickers empty above a card
  // that describes a period.
  const [barangayId, setBarangayId] = useState(resume ? String(resume.barangayId) : "");
  const [year, setYear] = useState(resume ? String(resume.year) : "");
  const [month, setMonth] = useState(resume ? String(resume.month) : "");

  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [closeConfirming, setCloseConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const [reopenConfirming, setReopenConfirming] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // The year list is derived from today's date; recomputing it on every
  // keystroke of state would be pointless, and re-running it across midnight is
  // not a case worth handling.
  const years = useMemo(() => selectableYears(), []);

  useEffect(() => {
    let cancelled = false;
    listBarangays(db).then(
      (rows) => {
        if (!cancelled) setBarangays(rows);
      },
      (error: unknown) => {
        if (!cancelled) setListError(errorMessage(error));
      },
    );
    // StrictMode runs effects twice in development; without this the second
    // run's result could arrive after the first and overwrite it.
    return () => {
      cancelled = true;
    };
  }, [db]);

  /**
   * Restores the card for a period a register's Back button handed back.
   *
   * Re-read rather than trusted: the payload says what was true when she
   * left, and she may have closed the period or posted an entry in the
   * meantime. `periodSummaryById` is used instead of `openPeriodSummary`
   * on purpose — resuming must never be able to create a period row (see
   * that function's own comment). A failure here is not fatal: the screen
   * falls back to the ordinary empty picker and says why.
   */
  useEffect(() => {
    if (!resume) return;
    let cancelled = false;
    setOpening(true);
    periodSummaryById(db, resume.periodId).then(
      (restored) => {
        if (cancelled) return;
        setSummary(restored);
        setOpening(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setSummary(null);
        setOpenError(errorMessage(error));
        setOpening(false);
      },
    );
    // Same StrictMode reason as the barangay list above.
    return () => {
      cancelled = true;
    };
  }, [db, resume]);

  const loaded = barangays !== null;
  const canProceed = barangayId !== "" && year !== "" && month !== "" && !opening;

  /** Clears any in-progress close/reopen confirmation — a stale summary means a stale confirm step too. */
  function resetPeriodActions() {
    setCloseConfirming(false);
    setCloseError(null);
    setReopenConfirming(false);
    setReopenReason("");
    setReopenError(null);
  }

  /**
   * Any change to the selection makes an already-shown period stale — it
   * describes the old choice. Clearing it is what stops the screen from
   * claiming December 2023 is open while the pickers say March 2024.
   */
  function chooseWith(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setSummary(null);
      setOpenError(null);
      resetPeriodActions();
    };
  }

  async function proceed() {
    setOpening(true);
    setOpenError(null);
    resetPeriodActions();
    try {
      setSummary(await openPeriodSummary(db, Number(barangayId), Number(year), Number(month)));
    } catch (error: unknown) {
      setSummary(null);
      setOpenError(errorMessage(error));
    } finally {
      setOpening(false);
    }
  }

  async function confirmClose() {
    if (!summary) return;
    setClosing(true);
    setCloseError(null);
    try {
      setSummary(await closePeriodAction(db, summary.periodId, currentUserId));
      setCloseConfirming(false);
    } catch (error: unknown) {
      setCloseError(errorMessage(error));
    } finally {
      setClosing(false);
    }
  }

  async function confirmReopen() {
    if (!summary) return;
    setReopening(true);
    setReopenError(null);
    try {
      setSummary(await reopenPeriodAction(db, summary.periodId, reopenReason, currentUserId));
      setReopenConfirming(false);
      setReopenReason("");
    } catch (error: unknown) {
      setReopenError(errorMessage(error));
    } finally {
      setReopening(false);
    }
  }

  const barangayOptions: SelectOption[] = (barangays ?? []).map((b) => ({
    value: String(b.id),
    label: b.name,
  }));
  const yearOptions: SelectOption[] = years.map((y) => ({ value: String(y), label: String(y) }));
  const monthOptions: SelectOption[] = MONTHS.map((m) => ({
    value: String(m.value),
    label: m.label,
  }));

  // The barangay list may not have arrived yet on the resume path, which would
  // otherwise render the card with a blank barangay name. The resumed name is
  // used only when it is the same barangay, so a card can never be labelled
  // with the wrong one.
  const openedBarangay = summary
    ? (barangays?.find((b) => b.id === summary.barangayId)?.name ??
      (resume && resume.barangayId === summary.barangayId ? resume.barangayName : ""))
    : "";

  const opened: OpenedBooks | null = summary
    ? {
        barangayId: summary.barangayId,
        barangayName: openedBarangay,
        periodId: summary.periodId,
        year: summary.year,
        month: summary.month,
        status: summary.status,
      }
    : null;

  return (
    <>
      {currentUserRole === "admin" ? (
        <div className="select-header">
          <Button variant="ghost" size="sm" onClick={() => onOpenChartOfAccounts(opened)}>
            Chart of accounts
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenUserAdmin(opened)}>
            Manage users
          </Button>
        </div>
      ) : null}

      <Card title="Select records" subtitle="Choose a barangay, year and month to open its books.">
        <div className="field-row">
          <Select
            label="Barangay"
            icon={<BuildingIcon />}
            placeholder={loaded ? "Choose barangay" : "Loading barangays…"}
            value={barangayId}
            options={barangayOptions}
            onChange={chooseWith(setBarangayId)}
            disabled={!loaded}
          />
          <Select
            label="Year"
            icon={<CalendarIcon />}
            placeholder="Choose year"
            value={year}
            options={yearOptions}
            onChange={chooseWith(setYear)}
            disabled={!loaded}
          />
          <Select
            label="Month"
            icon={<CalendarDaysIcon />}
            placeholder="Choose month"
            value={month}
            options={monthOptions}
            onChange={chooseWith(setMonth)}
            disabled={!loaded}
          />
          <div className="field field-action">
            <Button
              variant="dark"
              disabled={!canProceed}
              onClick={() => {
                void proceed();
              }}
            >
              {opening ? "Opening…" : "Proceed →"}
            </Button>
          </div>
        </div>

        {listError ? (
          <p className="form-error">The list of barangays could not be read. {listError}</p>
        ) : null}
        {openError ? <p className="form-error">{openError}</p> : null}
        {!listError && !openError && !canProceed && !opening ? (
          <p className="hint">Pick a barangay, year, and month to open its books.</p>
        ) : null}
      </Card>

      {summary ? (
        <Card className="period-summary">
          <div className="period-summary-head">
            <div>
              <div className="period-summary-title">
                <h2>
                  {formatPeriodLabel(summary.year, summary.month)}
                  {openedBarangay ? ` · ${openedBarangay}` : ""}
                </h2>
                <Badge tone={summary.status === "open" ? "open" : "closed"}>
                  {summary.status === "open" ? "Open for posting" : "Closed"}
                </Badge>
              </div>
              <p>
                {summary.entryCount} journal {summary.entryCount === 1 ? "entry" : "entries"}
              </p>
            </div>
            <div className="period-summary-actions">
              <Button variant="ghost" onClick={() => opened && onViewReports(opened)}>
                View reports
              </Button>
              <Button variant="ghost" onClick={() => opened && onOpenFixedAssets(opened)}>
                Fixed assets
              </Button>
              <Button variant="ghost" onClick={() => opened && onOpenAdvances(opened)}>
                Advances
              </Button>
              <Button variant="ghost" onClick={() => opened && onOpenBankReconciliation(opened)}>
                Bank reconciliation
              </Button>
              <Button variant="ghost" onClick={() => opened && onOpenSignatories(opened)}>
                Signatories
              </Button>
              {summary.status === "open" ? (
                closeConfirming ? (
                  <>
                    <Button variant="ghost" onClick={() => setCloseConfirming(false)} disabled={closing}>
                      Cancel
                    </Button>
                    <Button variant="dark" onClick={() => void confirmClose()} disabled={closing}>
                      {closing ? "Closing…" : "Confirm close"}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setCloseConfirming(true)}>
                    Close period
                  </Button>
                )
              ) : !reopenConfirming ? (
                <Button variant="ghost" onClick={() => setReopenConfirming(true)}>
                  Reopen
                </Button>
              ) : null}
              <Button variant="dark" onClick={() => opened && onOpenBooks(opened)}>
                Open the books →
              </Button>
            </div>
          </div>

          {closeError ? <p className="form-error">{closeError}</p> : null}

          {reopenConfirming ? (
            <div className="period-reopen-form">
              <TextField
                label="Reason for reopening"
                hideLabel
                value={reopenReason}
                onChange={setReopenReason}
                placeholder="Reason for reopening this period (required)"
                disabled={reopening}
              />
              <div className="period-reopen-actions">
                <Button variant="ghost" onClick={() => setReopenConfirming(false)} disabled={reopening}>
                  Cancel
                </Button>
                <Button
                  variant="dark"
                  onClick={() => void confirmReopen()}
                  disabled={reopening || reopenReason.trim() === ""}
                >
                  {reopening ? "Reopening…" : "Confirm reopen"}
                </Button>
              </div>
            </div>
          ) : null}
          {reopenError ? <p className="form-error">{reopenError}</p> : null}
        </Card>
      ) : null}
    </>
  );
}
