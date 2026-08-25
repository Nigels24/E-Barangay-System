import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextField } from "../components/TextField";
import { ArrowLeftIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { newCodeProblems } from "../lib/accountAdminForm";
import {
  listAllAccounts,
  resolveProvisionalCodeAction,
  setAccountActiveAction,
  type AdminAccountRecord,
} from "../lib/queries/accountsAdmin";
import "./ChartOfAccountsAdmin.css";

interface ChartOfAccountsAdminProps {
  db: EngineDb;
  onBack: () => void;
}

/**
 * Chart-of-accounts administration (D9-D12). Not barangay-scoped — D9 is
 * explicit that there is ONE chart shared by all 54 barangays, so unlike
 * every other register screen this one takes no `barangayId` and is
 * reached without opening a period first.
 *
 * Two actions, matching exactly what's blocked today per
 * docs/decisions.md's "Still genuinely blocked" list — confirming a
 * provisional code (D12) and activating/deactivating an account for the
 * voucher dropdowns (D10). Adding new accounts, or loading the rest of the
 * standard Revised Chart of Accounts, is deliberately out of scope: the
 * client's own COA circular hasn't been supplied, and reconstructing
 * official government account codes from memory would be worse than not
 * having them.
 */
export function ChartOfAccountsAdmin({ db, onBack }: ChartOfAccountsAdminProps) {
  const [accounts, setAccounts] = useState<AdminAccountRecord[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [newCode, setNewCode] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAllAccounts(db).then(
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

  async function reloadAccounts() {
    try {
      setAccounts(await listAllAccounts(db));
      setAccountsError(null);
    } catch (error: unknown) {
      setAccountsError(errorMessage(error));
    }
  }

  function startResolve(accountId: number) {
    setResolvingId(accountId);
    setNewCode("");
    setResolveError(null);
  }

  function cancelResolve() {
    setResolvingId(null);
    setNewCode("");
    setResolveError(null);
  }

  async function confirmResolve() {
    if (resolvingId === null) return;
    setResolving(true);
    setResolveError(null);
    try {
      await resolveProvisionalCodeAction(db, { accountId: resolvingId, newCode });
      cancelResolve();
      await reloadAccounts();
    } catch (error: unknown) {
      setResolveError(errorMessage(error));
    } finally {
      setResolving(false);
    }
  }

  async function toggleActive(acct: AdminAccountRecord) {
    setTogglingId(acct.id);
    setToggleError(null);
    try {
      await setAccountActiveAction(db, { accountId: acct.id, isActive: !acct.isActive });
      await reloadAccounts();
    } catch (error: unknown) {
      setToggleError(errorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  const accountsLoaded = accounts !== null;
  const existingCodes = (accounts ?? []).map((a) => a.code);
  const problems = resolvingId !== null ? newCodeProblems(newCode, existingCodes) : [];

  return (
    <>
      <div className="coa-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
      </div>

      <Card
        title="Chart of accounts"
        subtitle="One chart, shared by all 54 barangays (D9) — confirm a provisional code once the City Accountant supplies it (D12), or change which accounts a new voucher can post to (D10)."
      >
        {accountsError ? <p className="form-error">Accounts could not be read. {accountsError}</p> : null}
        {toggleError ? <p className="form-error">{toggleError}</p> : null}

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(accounts ?? []).length > 0 ? (
                  (accounts ?? []).map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{a.code}</td>
                      <td>
                        {a.name}
                        {a.isProvisionalCode ? <Badge tone="provisional">Provisional</Badge> : null}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{a.accountType}</td>
                      <td>
                        <Badge tone={a.isActive ? "posted" : "closed"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="coa-actions-cell">
                        {resolvingId === a.id ? (
                          <div className="coa-resolve-form">
                            <TextField
                              label={`Confirmed code for ${a.name}`}
                              hideLabel
                              value={newCode}
                              onChange={setNewCode}
                              placeholder="e.g. 4-01-04-010"
                              disabled={resolving}
                            />
                            {problems.length > 0 ? (
                              <ul className="coa-problems">
                                {problems.map((p) => (
                                  <li key={p}>{p}</li>
                                ))}
                              </ul>
                            ) : null}
                            {resolveError ? <p className="form-error">{resolveError}</p> : null}
                            <div className="coa-resolve-actions">
                              <Button variant="ghost" size="sm" onClick={cancelResolve} disabled={resolving}>
                                Cancel
                              </Button>
                              <Button
                                variant="dark"
                                size="sm"
                                onClick={() => {
                                  void confirmResolve();
                                }}
                                disabled={resolving || problems.length > 0}
                              >
                                {resolving ? "Saving…" : "Confirm"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="coa-row-actions">
                            {a.isProvisionalCode ? (
                              <Button variant="ghost" size="sm" onClick={() => startResolve(a.id)}>
                                Resolve code
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                void toggleActive(a);
                              }}
                              disabled={togglingId === a.id}
                            >
                              {togglingId === a.id ? "Saving…" : a.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      {accountsLoaded ? "No accounts on file." : "Loading the chart of accounts…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </>
  );
}
