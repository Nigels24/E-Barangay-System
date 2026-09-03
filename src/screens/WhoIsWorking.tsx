import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { UsersIcon } from "../components/icons";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { userRoleLabel } from "../lib/userForm";
import { listActiveUsers, type UserRecord } from "../lib/queries/users";
import "./WhoIsWorking.css";

interface WhoIsWorkingProps {
  db: EngineDb;
  onSelect: (user: UserRecord) => void;
}

/**
 * Login, in this app (D24/T-018): a name/role picker, not a password. One
 * shared office PC, opened fresh or reached via "Switch user" — either way,
 * this is the only place a session's actor gets chosen, and every write for
 * the rest of that session attributes to whoever is picked here.
 */
export function WhoIsWorking({ db, onSelect }: WhoIsWorkingProps) {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listActiveUsers(db).then(
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

  return (
    <Card title="Who's working?" subtitle="Choose your name — everything you do is recorded against it.">
      {usersError ? <p className="form-error">The list of users could not be read. {usersError}</p> : null}
      {users === null ? (
        <p className="hint">Loading…</p>
      ) : (
        <div className="wiw-list">
          {users.map((u) => (
            <button key={u.id} type="button" className="wiw-user" onClick={() => onSelect(u)}>
              <span className="wiw-user-icon">
                <UsersIcon size={18} />
              </span>
              <span className="wiw-user-info">
                <span className="wiw-user-name">{u.fullName}</span>
                <span className="wiw-user-position">{u.position ?? userRoleLabel(u.role)}</span>
              </span>
              <Badge>{userRoleLabel(u.role)}</Badge>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
