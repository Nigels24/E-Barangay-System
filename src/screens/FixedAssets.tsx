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
  emptyFixedAssetForm,
  fixedAssetProblems,
  residualRatePercentLabel,
  toNewFixedAssetInput,
  type FixedAssetFormState,
} from "../lib/fixedAssetForm";
import {
  createFixedAssetAction,
  disposeFixedAssetAction,
  listFixedAssetAccounts,
  listFixedAssets,
  type FixedAssetAccountOption,
  type FixedAssetRecord,
} from "../lib/queries/fixedAssets";
import { formatPeso } from "../lib/money";
import "./FixedAssets.css";

interface FixedAssetsProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  onBack: () => void;
  onViewSchedule: () => void;
}

/**
 * The fixed-asset register: add an asset, see what is on file, and record a
 * disposal. Not period-scoped — a physical asset belongs to the barangay for
 * as long as it is held, independent of which month's books are open (D21:
 * the register is its own thing, reconciled against the ledger, not forced
 * to agree with it). The printable Depreciation Schedule that reads this
 * register back "as of" a month lives on `Reports.tsx`, same split as every
 * other entry screen in this app keeping composition separate from print.
 */
export function FixedAssets({ db, barangayId, barangayName, onBack, onViewSchedule }: FixedAssetsProps) {
  const [accounts, setAccounts] = useState<FixedAssetAccountOption[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [assets, setAssets] = useState<FixedAssetRecord[] | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [form, setForm] = useState<FixedAssetFormState>(emptyFixedAssetForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<FixedAssetRecord | null>(null);

  const [disposingAssetId, setDisposingAssetId] = useState<number | null>(null);
  const [disposeDate, setDisposeDate] = useState("");
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFixedAssetAccounts(db).then(
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
    listFixedAssets(db, barangayId).then(
      (rows) => {
        if (!cancelled) setAssets(rows);
      },
      (error: unknown) => {
        if (!cancelled) setAssetsError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId]);

  async function reloadAssets() {
    try {
      setAssets(await listFixedAssets(db, barangayId));
      setAssetsError(null);
    } catch (error: unknown) {
      setAssetsError(errorMessage(error));
    }
  }

  function setField<K extends keyof FixedAssetFormState>(key: K, value: FixedAssetFormState[K]) {
    setLastSaved(null);
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const asset = await createFixedAssetAction(db, toNewFixedAssetInput(form, barangayId));
      setLastSaved(asset);
      setForm(emptyFixedAssetForm());
      await reloadAssets();
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function startDispose(assetId: number, acquisitionDate: string) {
    setDisposingAssetId(assetId);
    // A sane default: today, unless that would be before the asset was even
    // acquired (a back-entered old asset), in which case its own date.
    const today = new Date().toISOString().slice(0, 10);
    setDisposeDate(today >= acquisitionDate ? today : acquisitionDate);
    setDisposeError(null);
  }

  function cancelDispose() {
    setDisposingAssetId(null);
    setDisposeDate("");
    setDisposeError(null);
  }

  async function confirmDispose() {
    if (disposingAssetId === null) return;
    setDisposing(true);
    setDisposeError(null);
    try {
      await disposeFixedAssetAction(db, { assetId: disposingAssetId, disposalDate: disposeDate });
      cancelDispose();
      await reloadAssets();
    } catch (error: unknown) {
      setDisposeError(errorMessage(error));
    } finally {
      setDisposing(false);
    }
  }

  const accountsLoaded = accounts !== null;
  const assetsLoaded = assets !== null;
  const accountOptions: SelectOption[] = (accounts ?? []).map((a) => ({
    value: String(a.id),
    label: `${a.code} — ${a.name}`,
  }));

  const problems = fixedAssetProblems(form);
  const savable = problems.length === 0 && !saving;

  return (
    <>
      <div className="fa-header">
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

      <Card title="Add a fixed asset" subtitle="Recorded in the register — a separate fact from the ledger (D21).">
        {accountsError ? <p className="form-error">Accounts could not be read. {accountsError}</p> : null}

        <div className="field-row">
          <TextField label="Category" value={form.category} onChange={(v) => setField("category", v)} placeholder="e.g. Office Equipment" />
          <TextField label="Description" value={form.description} onChange={(v) => setField("description", v)} placeholder="e.g. Steel filing cabinet" />
          <TextField
            label="Acquisition date"
            type="date"
            value={form.acquisitionDate}
            onChange={(v) => setField("acquisitionDate", v)}
          />
        </div>

        <div className="field-row">
          <TextField
            label="Cost"
            value={form.cost}
            onChange={(v) => setField("cost", v)}
            prefix="₱"
            inputMode="decimal"
            figure
            placeholder="0.00"
          />
          <TextField
            label="Useful life (years)"
            value={form.usefulLifeYears}
            onChange={(v) => setField("usefulLifeYears", v)}
            inputMode="numeric"
            placeholder="10"
          />
          <TextField
            label="Residual rate (%)"
            value={form.residualRatePercent}
            onChange={(v) => setField("residualRatePercent", v)}
            inputMode="decimal"
            placeholder="10"
          />
        </div>

        <div className="field-row">
          <Select
            label="Account (optional)"
            placeholder={accountsLoaded ? "No account chosen" : "Loading accounts…"}
            value={form.accountId}
            options={accountOptions}
            onChange={(v) => setField("accountId", v)}
            disabled={!accountsLoaded}
          />
          <TextField
            label="Legacy FA-schedule code (optional)"
            value={form.legacyCode}
            onChange={(v) => setField("legacyCode", v)}
            placeholder="e.g. 221"
          />
        </div>

        <div className="fa-actions">
          {problems.length > 0 ? (
            <ul className="fa-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          {lastSaved ? (
            <p className="form-success">
              <CheckIcon size={14} /> {lastSaved.description} added to the register.
            </p>
          ) : null}
          <Button
            variant="dark"
            disabled={!savable}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Saving…" : "Add asset →"}
          </Button>
        </div>
      </Card>

      {assetsError ? <p className="form-error">The register could not be read. {assetsError}</p> : null}
      {disposeError ? <p className="form-error">{disposeError}</p> : null}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Acquired</th>
                <th style={{ textAlign: "right" }}>Cost</th>
                <th>Life</th>
                <th>Residual</th>
                <th>Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(assets ?? []).length > 0 ? (
                (assets ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.category}</td>
                    <td>{a.description}</td>
                    <td>{a.acquisitionDate}</td>
                    <td className="num">{formatPeso(a.costCentavos)}</td>
                    <td>{a.usefulLifeYears} yrs</td>
                    <td>{residualRatePercentLabel(a.residualRate)}</td>
                    <td style={{ color: "var(--muted)" }}>
                      {a.accountCode ? `${a.accountCode} — ${a.accountName}` : "—"}
                    </td>
                    <td>
                      {a.disposalDate ? (
                        <Badge tone="voided">Disposed {a.disposalDate}</Badge>
                      ) : (
                        <Badge tone="posted">Held</Badge>
                      )}
                    </td>
                    <td className="fa-dispose-cell">
                      {a.disposalDate ? null : disposingAssetId === a.id ? (
                        <div className="fa-dispose-form">
                          <TextField
                            label={`Disposal date for ${a.description}`}
                            hideLabel
                            type="date"
                            value={disposeDate}
                            onChange={setDisposeDate}
                            min={a.acquisitionDate}
                            disabled={disposing}
                          />
                          <div className="fa-dispose-actions">
                            <Button variant="ghost" size="sm" onClick={cancelDispose} disabled={disposing}>
                              Cancel
                            </Button>
                            <Button
                              variant="dark"
                              size="sm"
                              onClick={() => {
                                void confirmDispose();
                              }}
                              disabled={disposing || disposeDate.trim() === ""}
                            >
                              {disposing ? "Recording…" : "Confirm"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => startDispose(a.id, a.acquisitionDate)}>
                          Dispose
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty-row">
                    {assetsLoaded ? `No fixed assets recorded for ${barangayName} — add the first one above.` : "Loading the register…"}
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
