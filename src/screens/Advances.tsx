import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextField } from "../components/TextField";
import { ArrowLeftIcon, BarChartIcon, BuildingIcon, CheckIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import {
  advanceProblems,
  emptyAdvanceForm,
  liquidationProblems,
  toLiquidationCentavos,
  toNewAdvanceInput,
  type AdvanceFormState,
} from "../lib/advanceForm";
import {
  createAdvanceAction,
  liquidateAdvanceAction,
  listAdvances,
  type AdvanceRecord,
} from "../lib/queries/advances";
import { formatPeso } from "../lib/money";
import "./Advances.css";

interface AdvancesProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  /** The current session's user (T-018/D24) — every write here attributes to them. */
  currentUserId: number;
  onBack: () => void;
  onViewSchedule: () => void;
}

/**
 * The advances-to-officers-and-employees register: grant an advance, see
 * what is on file, and record a liquidation (in full or in part). Not
 * period-scoped — an advance belongs to the barangay for as long as it is
 * outstanding, independent of which month's books are open (same reasoning
 * as the fixed-asset register, D21: this register is its own thing,
 * reconciled against the ledger, not forced to agree with it). The printable
 * Schedule of Advances that reads this register back "as of" a month lives
 * on `Reports.tsx`, same composition/print split every other screen in this
 * app keeps.
 */
export function Advances({ db, barangayId, barangayName, currentUserId, onBack, onViewSchedule }: AdvancesProps) {
  const [advances, setAdvances] = useState<AdvanceRecord[] | null>(null);
  const [advancesError, setAdvancesError] = useState<string | null>(null);

  const [form, setForm] = useState<AdvanceFormState>(() => emptyAdvanceForm(new Date().toISOString().slice(0, 10)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<AdvanceRecord | null>(null);

  const [liquidatingAdvanceId, setLiquidatingAdvanceId] = useState<number | null>(null);
  const [liquidateAmount, setLiquidateAmount] = useState("");
  const [liquidating, setLiquidating] = useState(false);
  const [liquidateError, setLiquidateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdvances(db, barangayId).then(
      (rows) => {
        if (!cancelled) setAdvances(rows);
      },
      (error: unknown) => {
        if (!cancelled) setAdvancesError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId]);

  async function reloadAdvances() {
    try {
      setAdvances(await listAdvances(db, barangayId));
      setAdvancesError(null);
    } catch (error: unknown) {
      setAdvancesError(errorMessage(error));
    }
  }

  function setField<K extends keyof AdvanceFormState>(key: K, value: AdvanceFormState[K]) {
    setLastSaved(null);
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const advance = await createAdvanceAction(db, toNewAdvanceInput(form, barangayId), currentUserId);
      setLastSaved(advance);
      setForm(emptyAdvanceForm(new Date().toISOString().slice(0, 10)));
      await reloadAdvances();
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function startLiquidate(advanceId: number) {
    setLiquidatingAdvanceId(advanceId);
    setLiquidateAmount("");
    setLiquidateError(null);
  }

  function cancelLiquidate() {
    setLiquidatingAdvanceId(null);
    setLiquidateAmount("");
    setLiquidateError(null);
  }

  async function confirmLiquidate() {
    if (liquidatingAdvanceId === null) return;
    setLiquidating(true);
    setLiquidateError(null);
    try {
      await liquidateAdvanceAction(
        db,
        {
          advanceId: liquidatingAdvanceId,
          amountCentavos: toLiquidationCentavos(liquidateAmount),
        },
        currentUserId,
      );
      cancelLiquidate();
      await reloadAdvances();
    } catch (error: unknown) {
      setLiquidateError(errorMessage(error));
    } finally {
      setLiquidating(false);
    }
  }

  const advancesLoaded = advances !== null;
  const problems = advanceProblems(form);
  const savable = problems.length === 0 && !saving;

  const liquidatingAdvance = (advances ?? []).find((a) => a.id === liquidatingAdvanceId) ?? null;
  const outstandingCentavos = liquidatingAdvance
    ? liquidatingAdvance.amountCentavos - liquidatingAdvance.liquidatedCentavos
    : 0;
  const liquidateProblems = liquidatingAdvance ? liquidationProblems(liquidateAmount, outstandingCentavos) : [];

  return (
    <>
      <div className="adv-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
        <div className="badges">
          <Badge icon={<BuildingIcon />}>{barangayName}</Badge>
          <Button variant="ghost" size="sm" onClick={onViewSchedule}>
            <BarChartIcon size={14} /> View schedule
          </Button>
        </div>
      </div>

      <Card
        title="Grant an advance"
        subtitle="Recorded in the register — a separate fact from the ledger, same as the fixed-asset register."
      >
        <div className="field-row">
          <TextField
            label="Date granted"
            type="date"
            value={form.dateGranted}
            onChange={(v) => setField("dateGranted", v)}
          />
          <TextField label="Payee" value={form.payee} onChange={(v) => setField("payee", v)} placeholder="e.g. Juan Dela Cruz" />
          <TextField
            label="Particulars"
            value={form.particulars}
            onChange={(v) => setField("particulars", v)}
            placeholder="e.g. Travel advance for a Manila conference"
          />
          <TextField
            label="Amount"
            value={form.amount}
            onChange={(v) => setField("amount", v)}
            prefix="₱"
            inputMode="decimal"
            figure
            placeholder="0.00"
          />
        </div>

        <div className="adv-actions">
          {problems.length > 0 ? (
            <ul className="adv-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          {lastSaved ? (
            <p className="form-success">
              <CheckIcon size={14} /> Advance to {lastSaved.payee} added to the register.
            </p>
          ) : null}
          <Button
            variant="dark"
            disabled={!savable}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Saving…" : "Grant advance →"}
          </Button>
        </div>
      </Card>

      {advancesError ? <p className="form-error">The register could not be read. {advancesError}</p> : null}
      {liquidateError ? <p className="form-error">{liquidateError}</p> : null}

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
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(advances ?? []).length > 0 ? (
                (advances ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.dateGranted}</td>
                    <td>{a.payee}</td>
                    <td>{a.particulars}</td>
                    <td className="num">{formatPeso(a.amountCentavos)}</td>
                    <td className="num">{formatPeso(a.liquidatedCentavos)}</td>
                    <td className="num">{formatPeso(a.amountCentavos - a.liquidatedCentavos)}</td>
                    <td>
                      {a.status === "liquidated" ? (
                        <Badge tone="voided">Liquidated</Badge>
                      ) : (
                        <Badge tone="posted">Outstanding</Badge>
                      )}
                    </td>
                    <td className="adv-liquidate-cell">
                      {a.status === "liquidated" ? null : liquidatingAdvanceId === a.id ? (
                        <div className="adv-liquidate-form">
                          <TextField
                            label={`Liquidation amount for the advance to ${a.payee}`}
                            hideLabel
                            value={liquidateAmount}
                            onChange={setLiquidateAmount}
                            prefix="₱"
                            inputMode="decimal"
                            figure
                            placeholder="0.00"
                            disabled={liquidating}
                          />
                          {liquidateProblems.length > 0 ? (
                            <ul className="adv-problems">
                              {liquidateProblems.map((problem) => (
                                <li key={problem}>{problem}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="adv-liquidate-actions">
                            <Button variant="ghost" size="sm" onClick={cancelLiquidate} disabled={liquidating}>
                              Cancel
                            </Button>
                            <Button
                              variant="dark"
                              size="sm"
                              onClick={() => {
                                void confirmLiquidate();
                              }}
                              disabled={liquidating || liquidateProblems.length > 0}
                            >
                              {liquidating ? "Recording…" : "Confirm"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => startLiquidate(a.id)}>
                          Liquidate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty-row">
                    {advancesLoaded
                      ? `No advances recorded for ${barangayName} — grant the first one above.`
                      : "Loading the register…"}
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
