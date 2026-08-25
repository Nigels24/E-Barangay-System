import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
import { errorMessage } from "./lib/errorMessage";
import type { EngineDb } from "./lib/engine/types";
import { Advances } from "./screens/Advances";
import { BankReconciliation } from "./screens/BankReconciliation";
import { ChartOfAccountsAdmin } from "./screens/ChartOfAccountsAdmin";
import { FixedAssets } from "./screens/FixedAssets";
import { JournalVoucher } from "./screens/JournalVoucher";
import { Reports, type ReportsView } from "./screens/Reports";
import { SelectRecords, type OpenedBooks } from "./screens/SelectRecords";
import { Signatories } from "./screens/Signatories";
import "./App.css";

type Bootstrap =
  | { status: "loading" }
  | { status: "ready"; db: EngineDb }
  | { status: "failed"; message: string };

/**
 * The app's screen transitions. No router: there are a handful of screens,
 * and `App` already owns the bootstrap state beside it. Reports carries
 * `from` so its Back returns to wherever it was opened from — the picker, a
 * voucher in progress, or the fixed-asset register — rather than always
 * landing on the picker.
 */
type Screen =
  | { name: "select" }
  | ({ name: "journal" } & OpenedBooks)
  | ({ name: "fixedAssets" } & OpenedBooks)
  | ({ name: "advances" } & OpenedBooks)
  | ({ name: "bankReconciliation" } & OpenedBooks)
  | ({ name: "signatories" } & OpenedBooks)
  /** Not barangay-scoped (D9 — one chart shared by all 54 barangays), unlike every other register. */
  | { name: "chartOfAccounts" }
  | ({
      name: "reports";
      from: "select" | "journal" | "fixedAssets" | "advances" | "bankReconciliation";
      initialView?: ReportsView;
    } & OpenedBooks);

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
    <AppShell
      wide={
        bootstrap.status === "ready" &&
        (screen.name === "journal" ||
          screen.name === "fixedAssets" ||
          screen.name === "advances" ||
          screen.name === "bankReconciliation" ||
          screen.name === "signatories" ||
          screen.name === "chartOfAccounts" ||
          screen.name === "reports")
      }
    >
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
          <SelectRecords
            db={bootstrap.db}
            onOpenBooks={(opened) => setScreen({ name: "journal", ...opened })}
            onViewReports={(opened) => setScreen({ name: "reports", from: "select", ...opened })}
            onOpenFixedAssets={(opened) => setScreen({ name: "fixedAssets", ...opened })}
            onOpenAdvances={(opened) => setScreen({ name: "advances", ...opened })}
            onOpenBankReconciliation={(opened) => setScreen({ name: "bankReconciliation", ...opened })}
            onOpenSignatories={(opened) => setScreen({ name: "signatories", ...opened })}
            onOpenChartOfAccounts={() => setScreen({ name: "chartOfAccounts" })}
          />
        ) : screen.name === "journal" ? (
          <JournalVoucher
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            periodId={screen.periodId}
            year={screen.year}
            month={screen.month}
            status={screen.status}
            onBack={() => setScreen({ name: "select" })}
            onViewReports={() =>
              setScreen({
                name: "reports",
                from: "journal",
                barangayId: screen.barangayId,
                barangayName: screen.barangayName,
                periodId: screen.periodId,
                year: screen.year,
                month: screen.month,
                status: screen.status,
              })
            }
            onOpenFixedAssets={() => setScreen({ ...screen, name: "fixedAssets" })}
            onOpenAdvances={() => setScreen({ ...screen, name: "advances" })}
            onOpenBankReconciliation={() => setScreen({ ...screen, name: "bankReconciliation" })}
            onOpenSignatories={() => setScreen({ ...screen, name: "signatories" })}
            onOpenChartOfAccounts={() => setScreen({ name: "chartOfAccounts" })}
          />
        ) : screen.name === "fixedAssets" ? (
          <FixedAssets
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            onBack={() => setScreen({ name: "select" })}
            onViewSchedule={() =>
              setScreen({
                name: "reports",
                from: "fixedAssets",
                initialView: "assets",
                barangayId: screen.barangayId,
                barangayName: screen.barangayName,
                periodId: screen.periodId,
                year: screen.year,
                month: screen.month,
                status: screen.status,
              })
            }
          />
        ) : screen.name === "advances" ? (
          <Advances
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            onBack={() => setScreen({ name: "select" })}
            onViewSchedule={() =>
              setScreen({
                name: "reports",
                from: "advances",
                initialView: "advances",
                barangayId: screen.barangayId,
                barangayName: screen.barangayName,
                periodId: screen.periodId,
                year: screen.year,
                month: screen.month,
                status: screen.status,
              })
            }
          />
        ) : screen.name === "bankReconciliation" ? (
          <BankReconciliation
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            periodId={screen.periodId}
            year={screen.year}
            month={screen.month}
            onBack={() => setScreen({ name: "select" })}
            onViewStatement={() =>
              setScreen({
                name: "reports",
                from: "bankReconciliation",
                initialView: "bankrec",
                barangayId: screen.barangayId,
                barangayName: screen.barangayName,
                periodId: screen.periodId,
                year: screen.year,
                month: screen.month,
                status: screen.status,
              })
            }
          />
        ) : screen.name === "signatories" ? (
          <Signatories
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            onBack={() => setScreen({ name: "select" })}
          />
        ) : screen.name === "chartOfAccounts" ? (
          <ChartOfAccountsAdmin db={bootstrap.db} onBack={() => setScreen({ name: "select" })} />
        ) : (
          <Reports
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            year={screen.year}
            month={screen.month}
            initialView={screen.initialView}
            onBack={() =>
              screen.from === "journal"
                ? setScreen({
                    name: "journal",
                    barangayId: screen.barangayId,
                    barangayName: screen.barangayName,
                    periodId: screen.periodId,
                    year: screen.year,
                    month: screen.month,
                    status: screen.status,
                  })
                : screen.from === "fixedAssets"
                  ? setScreen({
                      name: "fixedAssets",
                      barangayId: screen.barangayId,
                      barangayName: screen.barangayName,
                      periodId: screen.periodId,
                      year: screen.year,
                      month: screen.month,
                      status: screen.status,
                    })
                  : screen.from === "advances"
                    ? setScreen({
                        name: "advances",
                        barangayId: screen.barangayId,
                        barangayName: screen.barangayName,
                        periodId: screen.periodId,
                        year: screen.year,
                        month: screen.month,
                        status: screen.status,
                      })
                    : screen.from === "bankReconciliation"
                      ? setScreen({
                          name: "bankReconciliation",
                          barangayId: screen.barangayId,
                          barangayName: screen.barangayName,
                          periodId: screen.periodId,
                          year: screen.year,
                          month: screen.month,
                          status: screen.status,
                        })
                      : setScreen({ name: "select" })
            }
          />
        )
      ) : null}
    </AppShell>
  );
}

export default App;
