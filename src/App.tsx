import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
import { errorMessage } from "./lib/errorMessage";
import type { EngineDb } from "./lib/engine/types";
import { JournalVoucher } from "./screens/JournalVoucher";
import { SelectRecords, type OpenedBooks } from "./screens/SelectRecords";
import "./App.css";

type Bootstrap =
  | { status: "loading" }
  | { status: "ready"; db: EngineDb }
  | { status: "failed"; message: string };

/**
 * The one screen transition the app has. No router: there are exactly two
 * screens, and `App` already owns the bootstrap state beside it.
 */
type Screen = { name: "select" } | ({ name: "journal" } & OpenedBooks);

/**
 * The app, and the one place the database bootstrap becomes visible.
 *
 * `main.tsx` starts the bootstrap and hands the promise down; this renders its
 * three states. The failed state is the point of the arrangement. Until now a
 * bootstrap failure was a `console.error`, and on the office PC nobody will
 * ever open that console — which made a broken database look exactly like an
 * app with no data in it. An accounting system that cannot tell those two apart
 * is worse than one that refuses to start, so a failure gets the whole screen
 * and says what went wrong.
 *
 * No router and no state library: there is one screen, and the bootstrap has
 * three states.
 */
function App({ db }: { db: Promise<EngineDb> }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ status: "loading" });
  const [screen, setScreen] = useState<Screen>({ name: "select" });

  useEffect(() => {
    let cancelled = false;
    db.then(
      (handle) => {
        if (!cancelled) setBootstrap({ status: "ready", db: handle });
      },
      (error: unknown) => {
        if (!cancelled) setBootstrap({ status: "failed", message: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  return (
    <AppShell wide={bootstrap.status === "ready" && screen.name === "journal"}>
      {bootstrap.status === "loading" ? (
        <Card title="Opening the books…" subtitle="Preparing the database on this computer." />
      ) : null}

      {bootstrap.status === "failed" ? (
        <Card className="bootstrap-failure">
          <h2>The books could not be opened</h2>
          <p className="bootstrap-failure-message">{bootstrap.message}</p>
          <p className="hint">
            No records have been changed. Give this message to whoever maintains the system —
            it says exactly what is wrong.
          </p>
        </Card>
      ) : null}

      {bootstrap.status === "ready" ? (
        screen.name === "select" ? (
          <SelectRecords db={bootstrap.db} onOpenBooks={(opened) => setScreen({ name: "journal", ...opened })} />
        ) : (
          <JournalVoucher
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            periodId={screen.periodId}
            year={screen.year}
            month={screen.month}
            onBack={() => setScreen({ name: "select" })}
          />
        )
      ) : null}
    </AppShell>
  );
}

export default App;
