import { useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextField } from "../components/TextField";
import { errorMessage } from "../lib/errorMessage";
import type { EngineDb } from "../lib/engine/types";
import { createFirstUserAction, type UserRecord } from "../lib/queries/users";
import "./FirstRunSetup.css";

interface FirstRunSetupProps {
  db: EngineDb;
  onCreated: (user: UserRecord) => void;
}

/**
 * Shown once, only when `listActiveUsers` comes back empty — a brand-new
 * database, or one seeded before T-018 real users existed. Creates the very
 * first user, always as Administrator (`createFirstUserAction` enforces
 * this regardless of what's shown here): nobody else exists yet to grant
 * that role afterward if this one were wrong.
 *
 * No password field — login in this app is a name/role picker (D24), not a
 * password. Whoever fills this in becomes the first user, and is signed in
 * as them immediately; there is no separate first sign-in step.
 */
export function FirstRunSetup({ db, onCreated }: FirstRunSetupProps) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const problems: string[] = [];
  if (username.trim() === "") problems.push("Give this account a username.");
  if (fullName.trim() === "") problems.push("Give this account's full name.");
  const savable = problems.length === 0 && !saving;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createFirstUserAction(db, {
        username: username.trim(),
        fullName: fullName.trim(),
        position: position.trim() || undefined,
      });
      onCreated(created);
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Set up the first account"
      subtitle="This computer's books have no users on file yet. Create the first one — it is an Administrator, so it can add everyone else afterward."
    >
      <div className="frs-form">
        <TextField label="Username" value={username} onChange={setUsername} placeholder="e.g. jdelacruz" />
        <TextField label="Full name" value={fullName} onChange={setFullName} placeholder="e.g. Juana Dela Cruz" />
        <TextField label="Position" value={position} onChange={setPosition} placeholder="e.g. City Accountant (optional)" />
      </div>
      <div className="frs-actions">
        {problems.length > 0 ? (
          <ul className="frs-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {saveError ? <p className="form-error">{saveError}</p> : null}
        <Button
          variant="dark"
          disabled={!savable}
          onClick={() => {
            void save();
          }}
        >
          {saving ? "Creating…" : "Create account →"}
        </Button>
      </div>
    </Card>
  );
}
