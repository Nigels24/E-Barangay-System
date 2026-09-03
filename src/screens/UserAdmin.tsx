import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select } from "../components/Select";
import { TextField } from "../components/TextField";
import { ArrowLeftIcon, CheckIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import {
  USER_ROLE_OPTIONS,
  emptyUserForm,
  toNewUserInput,
  userFormProblems,
  userRoleLabel,
  type UserFormState,
} from "../lib/userForm";
import type { UserRole } from "../db/schema";
import { createUserAction, listAllUsers, setUserActiveAction, type UserRecord } from "../lib/queries/users";
import "./UserAdmin.css";

interface UserAdminProps {
  db: EngineDb;
  /** The current session's user (T-018/D24) — every write here attributes to them. `App.tsx` only reaches this screen for an Administrator. */
  currentUserId: number;
  onBack: () => void;
}

/**
 * User administration (D24/T-018): the Administrator-only screen that adds
 * users and activates/deactivates them — the counterpart to
 * `ChartOfAccountsAdmin.tsx`, gated the same way (reachable only when
 * `currentUserRole === "admin"`, purely at the UI level; see that screen's
 * own doc comment for why that is the app's established pattern).
 *
 * Deactivating the last active Administrator is refused by the engine
 * (`setUserActive`), not by anything here — this screen just surfaces
 * whatever error comes back, same as every other action on this app.
 */
export function UserAdmin({ db, currentUserId, onBack }: UserAdminProps) {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [form, setForm] = useState<UserFormState>(emptyUserForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<UserRecord | null>(null);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAllUsers(db).then(
      (rows) => {
        if (!cancelled) setUsers(rows);
      },
      (error: unknown) => {
        if (!cancelled) setUsersError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  async function reloadUsers() {
    try {
      setUsers(await listAllUsers(db));
      setUsersError(null);
    } catch (error: unknown) {
      setUsersError(errorMessage(error));
    }
  }

  function setField<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setLastSaved(null);
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const existingUsernames = (users ?? []).map((u) => u.username);
  const problems = userFormProblems(form, existingUsernames);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createUserAction(db, toNewUserInput(form), currentUserId);
      setLastSaved(created);
      setForm(emptyUserForm());
      await reloadUsers();
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: UserRecord) {
    setTogglingId(user.id);
    setToggleError(null);
    try {
      await setUserActiveAction(db, { userId: user.id, isActive: !user.isActive }, currentUserId);
      await reloadUsers();
    } catch (error: unknown) {
      setToggleError(errorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  const usersLoaded = users !== null;
  const savable = problems.length === 0 && !saving;

  return (
    <>
      <div className="ua-header">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeftIcon size={15} /> Back
        </button>
      </div>

      <Card
        title="Add a user"
        subtitle="No password (D24) — this office shares one PC, and everyone signs in by picking their own name."
      >
        <div className="field-row">
          <TextField label="Username" value={form.username} onChange={(v) => setField("username", v)} placeholder="e.g. jdelacruz" />
          <TextField label="Full name" value={form.fullName} onChange={(v) => setField("fullName", v)} placeholder="e.g. Juana Dela Cruz" />
          <TextField label="Position" value={form.position} onChange={(v) => setField("position", v)} placeholder="Optional" />
          <Select
            label="Role"
            placeholder="Choose a role"
            value={form.role}
            options={USER_ROLE_OPTIONS}
            onChange={(v) => setField("role", v as UserRole)}
          />
        </div>
        <div className="ua-actions">
          {problems.length > 0 ? (
            <ul className="ua-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          {lastSaved ? (
            <p className="form-success">
              <CheckIcon size={14} /> {lastSaved.fullName} added as {userRoleLabel(lastSaved.role)}.
            </p>
          ) : null}
          <Button
            variant="dark"
            size="sm"
            disabled={!savable}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Adding…" : "Add user →"}
          </Button>
        </div>
      </Card>

      {usersError ? <p className="form-error">Users could not be read. {usersError}</p> : null}
      {toggleError ? <p className="form-error">{toggleError}</p> : null}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Position</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).length > 0 ? (
                (users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{u.username}</td>
                    <td>{userRoleLabel(u.role)}</td>
                    <td style={{ color: "var(--muted)" }}>{u.position ?? "—"}</td>
                    <td>
                      <Badge tone={u.isActive ? "posted" : "closed"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void toggleActive(u);
                        }}
                        disabled={togglingId === u.id}
                      >
                        {togglingId === u.id ? "Saving…" : u.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    {usersLoaded ? "No users on file." : "Loading users…"}
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
