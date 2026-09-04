import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
import { errorMessage } from "./lib/errorMessage";
import type { EngineDb } from "./lib/engine/types";
import { listActiveUsers, type UserRecord } from "./lib/queries/users";
import { Advances } from "./screens/Advances";
import { BankReconciliation } from "./screens/BankReconciliation";
import { ChartOfAccountsAdmin } from "./screens/ChartOfAccountsAdmin";
import { FirstRunSetup } from "./screens/FirstRunSetup";
import { FixedAssets } from "./screens/FixedAssets";
import { JournalVoucher } from "./screens/JournalVoucher";
import { Reports, type ReportsView } from "./screens/Reports";
import { SelectRecords, type OpenedBooks } from "./screens/SelectRecords";
import { Signatories } from "./screens/Signatories";
import { UserAdmin } from "./screens/UserAdmin";
import { WhoIsWorking } from "./screens/WhoIsWorking";
import "./App.css";

type Bootstrap =
  | { status: "loading" }
  | { status: "ready"; db: EngineDb }
  | { status: "failed"; message: string };

/**
 * Login, in this app (D24/T-018): a name/role picker, not a password — see
 * `db/schema.ts`'s comment on `app_user.passwordHash`. This is the state
 * machine for it, driven off `listActiveUsers` once the database itself is
 * ready: a database with no users yet goes to `firstRun`; otherwise the
 * session starts at `picking` (or returns there via "Switch user") until a
 * name is chosen. Every screen past that point is handed `session.user`'s
 * id (and role, where a screen gates on it) as its own `currentUserId` /
 * `currentUserRole` prop.
 */
type Session =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "firstRun" }
  | { status: "picking" }
  | { status: "active"; user: UserRecord };

/**
 * The app's screen transitions. No router: there are a handful of screens,
 * and `App` already owns the bootstrap state beside it. Reports carries
 * `from` so its Back returns to wherever it was opened from — the picker, a
 * voucher in progress, or the fixed-asset register — rather than always
 * landing on the picker.
 */
type Screen =
  /**
   * `resume` is a period the picker had already opened, handed back by a
   * register's Back so the selection screen returns to that opened card
   * instead of resetting to empty pickers. `SelectRecords` re-reads the
   * period from the database rather than trusting this payload, so a period
   * closed while she was away still shows as closed.
   */
  | { name: "select"; resume?: OpenedBooks }
  | ({ name: "journal" } & OpenedBooks)
  | ({ name: "fixedAssets" } & OpenedBooks)
  | ({ name: "advances" } & OpenedBooks)
  | ({ name: "bankReconciliation" } & OpenedBooks)
  | ({ name: "signatories" } & OpenedBooks)
  /**
   * Not barangay-scoped (D9 — one chart shared by all 54 barangays), unlike
   * every other register. It still carries `resume` though: it is reachable
   * with a period open, and Back should not throw that selection away just
   * because this screen has no use for it itself.
   */
  | { name: "chartOfAccounts"; resume?: OpenedBooks }
  /** Administrator-only (D24), reached the same way `chartOfAccounts` is — not barangay-scoped either. */
  | { name: "userAdmin"; resume?: OpenedBooks }
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
  const [session, setSession] = useState<Session>({ status: "loading" });
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

  useEffect(() => {
    if (bootstrap.status !== "ready") return;
    let cancelled = false;
    listActiveUsers(bootstrap.db).then(
      (users) => {
        if (!cancelled) setSession(users.length === 0 ? { status: "firstRun" } : { status: "picking" });
      },
      (error: unknown) => {
        if (!cancelled) setSession({ status: "failed", message: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  function switchUser() {
    setSession({ status: "picking" });
    setScreen({ name: "select" });
  }

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
          screen.name === "userAdmin" ||
          screen.name === "reports")
      }
      currentUserName={session.status === "active" ? session.user.fullName : undefined}
      onSwitchUser={session.status === "active" ? switchUser : undefined}
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

      {bootstrap.status === "ready" && session.status === "loading" ? (
        <Card title="Loading…" subtitle="Checking who's on file." />
      ) : null}

      {bootstrap.status === "ready" && session.status === "failed" ? (
        <Card className="bootstrap-failure">
          <h2>The list of users could not be read</h2>
          <p className="bootstrap-failure-message">{session.message}</p>
        </Card>
      ) : null}

      {bootstrap.status === "ready" && session.status === "firstRun" ? (
        <FirstRunSetup db={bootstrap.db} onCreated={(user) => setSession({ status: "active", user })} />
      ) : null}

      {bootstrap.status === "ready" && session.status === "picking" ? (
        <WhoIsWorking db={bootstrap.db} onSelect={(user) => setSession({ status: "active", user })} />
      ) : null}

      {bootstrap.status === "ready" && session.status === "active" ? (
        screen.name === "select" ? (
          <SelectRecords
            db={bootstrap.db}
            resume={screen.resume}
            currentUserId={session.user.id}
            currentUserRole={session.user.role}
            onOpenBooks={(opened) => setScreen({ name: "journal", ...opened })}
            onViewReports={(opened) => setScreen({ name: "reports", from: "select", ...opened })}
            onOpenFixedAssets={(opened) => setScreen({ name: "fixedAssets", ...opened })}
            onOpenAdvances={(opened) => setScreen({ name: "advances", ...opened })}
            onOpenBankReconciliation={(opened) => setScreen({ name: "bankReconciliation", ...opened })}
            onOpenSignatories={(opened) => setScreen({ name: "signatories", ...opened })}
            onOpenChartOfAccounts={(opened) =>
              setScreen({ name: "chartOfAccounts", resume: opened ?? undefined })
            }
            onOpenUserAdmin={(opened) => setScreen({ name: "userAdmin", resume: opened ?? undefined })}
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
            currentUserId={session.user.id}
            currentUserRole={session.user.role}
            onOpenUserAdmin={() =>
              setScreen({
                name: "userAdmin",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
            onBack={() =>
              setScreen({
                name: "select",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
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
            onOpenChartOfAccounts={() =>
              setScreen({
                name: "chartOfAccounts",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
          />
        ) : screen.name === "fixedAssets" ? (
          <FixedAssets
            db={bootstrap.db}
            barangayId={screen.barangayId}
            barangayName={screen.barangayName}
            currentUserId={session.user.id}
            onBack={() =>
              setScreen({
                name: "select",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
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
            currentUserId={session.user.id}
            onBack={() =>
              setScreen({
                name: "select",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
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
            currentUserId={session.user.id}
            onBack={() =>
              setScreen({
                name: "select",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
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
            currentUserId={session.user.id}
            onBack={() =>
              setScreen({
                name: "select",
                resume: {
                  barangayId: screen.barangayId,
                  barangayName: screen.barangayName,
                  periodId: screen.periodId,
                  year: screen.year,
                  month: screen.month,
                  status: screen.status,
                },
              })
            }
          />
        ) : screen.name === "chartOfAccounts" ? (
          <ChartOfAccountsAdmin
            db={bootstrap.db}
            currentUserId={session.user.id}
            onBack={() => setScreen({ name: "select", resume: screen.resume })}
          />
        ) : screen.name === "userAdmin" ? (
          <UserAdmin
            db={bootstrap.db}
            currentUserId={session.user.id}
            onBack={() => setScreen({ name: "select", resume: screen.resume })}
          />
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
                      : setScreen({
                          name: "select",
                          resume: {
                            barangayId: screen.barangayId,
                            barangayName: screen.barangayName,
                            periodId: screen.periodId,
                            year: screen.year,
                            month: screen.month,
                            status: screen.status,
                          },
                        })
            }
          />
        )
      ) : null}
    </AppShell>
  );
}

export default App;
