import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select } from "../components/Select";
import { TextField } from "../components/TextField";
import { ArrowLeftIcon, BuildingIcon, CheckIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import {
  SIGNATORY_ROLE_OPTIONS,
  emptySignatoryForm,
  signatoryProblems,
  signatoryRoleLabel,
  toNewSignatoryInput,
  type SignatoryFormState,
} from "../lib/signatoryForm";
import { createSignatoryAction, listSignatories, type SignatoryRecord } from "../lib/queries/signatories";
import type { SignatoryRole } from "../db/schema";
import "./Signatories.css";

interface SignatoriesProps {
  db: EngineDb;
  barangayId: number;
  barangayName: string;
  /** The current session's user (T-018/D24) — every write here attributes to them. */
  currentUserId: number;
  onBack: () => void;
}

/**
 * The signatory register (D25): who signs a printed report, per barangay
 * and per role, effective from a date. Not period-scoped — an officer's
 * term has nothing to do with which month's books happen to be open. A new
 * officer is a new row, never an edit to an existing one (see
 * `engine/signatories.ts`), so this screen only ever adds; there is no
 * dispose/liquidate-style follow-up action the way the other registers
 * have. What a printed report actually shows is resolved separately, "as
 * of" that report's own date — see `reports/signatories.ts` and
 * `Reports.tsx`'s `SignatureBlock`.
 */
export function Signatories({ db, barangayId, barangayName, currentUserId, onBack }: SignatoriesProps) {
  const [signatories, setSignatories] = useState<SignatoryRecord[] | null>(null);
  const [signatoriesError, setSignatoriesError] = useState<string | null>(null);

  const [form, setForm] = useState<SignatoryFormState>(() => emptySignatoryForm(new Date().toISOString().slice(0, 10)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SignatoryRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSignatories(db, barangayId).then(
      (rows) => {
        if (!cancelled) setSignatories(rows);
      },
      (error: unknown) => {
        if (!cancelled) setSignatoriesError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, barangayId]);

  async function reloadSignatories() {
    try {
      setSignatories(await listSignatories(db, barangayId));
      setSignatoriesError(null);
    } catch (error: unknown) {
      setSignatoriesError(errorMessage(error));
    }
  }

  function setField<K extends keyof SignatoryFormState>(key: K, value: SignatoryFormState[K]) {
    setLastSaved(null);
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createSignatoryAction(db, toNewSignatoryInput(form, barangayId), currentUserId);
      setLastSaved(created);
      setForm(emptySignatoryForm(new Date().toISOString().slice(0, 10)));
      await reloadSignatories();
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const signatoriesLoaded = signatories !== null;
  const problems = signatoryProblems(form);
  const savable = problems.length === 0 && !saving;

  return (
    <>
      <div className="sig-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
        <div className="badges">
          <Badge icon={<BuildingIcon />}>{barangayName}</Badge>
        </div>
      </div>

      <Card
        title="Add a signatory"
        subtitle="Officials change over the years this system runs (D25) — a new officer is a new entry, effective from a date, never an edit to an old one."
      >
        <div className="field-row">
          <Select
            label="Role"
            placeholder="Choose a role"
            value={form.role}
            options={SIGNATORY_ROLE_OPTIONS}
            onChange={(v) => setField("role", v as SignatoryRole)}
          />
          <TextField label="Name" value={form.name} onChange={(v) => setField("name", v)} placeholder="e.g. Juan Dela Cruz" />
          <TextField
            label="Designation"
            value={form.designation}
            onChange={(v) => setField("designation", v)}
            placeholder="e.g. Barangay Treasurer"
          />
          <TextField
            label="Effective from"
            type="date"
            value={form.effectiveFrom}
            onChange={(v) => setField("effectiveFrom", v)}
          />
        </div>

        <div className="sig-actions">
          {problems.length > 0 ? (
            <ul className="sig-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          {lastSaved ? (
            <p className="form-success">
              <CheckIcon size={14} /> {lastSaved.name} added as {signatoryRoleLabel(lastSaved.role)}.
            </p>
          ) : null}
          <Button
            variant="dark"
            disabled={!savable}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Saving…" : "Add signatory →"}
          </Button>
        </div>
      </Card>

      {signatoriesError ? <p className="form-error">The register could not be read. {signatoriesError}</p> : null}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th>Designation</th>
                <th>Effective from</th>
              </tr>
            </thead>
            <tbody>
              {(signatories ?? []).length > 0 ? (
                (signatories ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{signatoryRoleLabel(s.role)}</td>
                    <td>{s.name}</td>
                    <td>{s.designation}</td>
                    <td>{s.effectiveFrom}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="empty-row">
                    {signatoriesLoaded
                      ? `No signatories recorded for ${barangayName} — add the first one above.`
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
