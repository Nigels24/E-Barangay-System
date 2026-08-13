import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select, type SelectOption } from "../components/Select";
import { BuildingIcon, CalendarDaysIcon, CalendarIcon } from "../components/icons";
import { MONTHS, formatPeriodLabel, selectableYears } from "../lib/calendar";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { listBarangays, type BarangayOption } from "../lib/queries/barangays";
import { openPeriodSummary, type PeriodSummary } from "../lib/queries/periods";
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
export function SelectRecords({ db }: { db: EngineDb }) {
  const [barangays, setBarangays] = useState<BarangayOption[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [barangayId, setBarangayId] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");

  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

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

  const loaded = barangays !== null;
  const canProceed = barangayId !== "" && year !== "" && month !== "" && !opening;

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
    };
  }

  async function proceed() {
    setOpening(true);
    setOpenError(null);
    try {
      setSummary(await openPeriodSummary(db, Number(barangayId), Number(year), Number(month)));
    } catch (error: unknown) {
      setSummary(null);
      setOpenError(errorMessage(error));
    } finally {
      setOpening(false);
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

  const openedBarangay = summary
    ? (barangays?.find((b) => b.id === summary.barangayId)?.name ?? "")
    : "";

  return (
    <>
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
              <h2>
                {formatPeriodLabel(summary.year, summary.month)}
                {openedBarangay ? ` · ${openedBarangay}` : ""}
              </h2>
              <p>
                {summary.entryCount} journal {summary.entryCount === 1 ? "entry" : "entries"}
              </p>
            </div>
            <Badge icon={<CalendarIcon />}>{summary.status === "open" ? "Open" : "Closed"}</Badge>
          </div>
        </Card>
      ) : null}
    </>
  );
}
