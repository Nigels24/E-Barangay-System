import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";

/**
 * Placeholder shell. The barangay / year / month pickers and everything below
 * them arrive once the React-to-SQLite data layer is decided; this task is
 * presentation only.
 */
function App() {
  return (
    <AppShell>
      <Card
        title="Select records"
        subtitle="Choose a barangay, year and month to open its books."
      >
        <p className="hint">
          Selection controls are not wired up yet — this screen currently shows the design
          system only.
        </p>
      </Card>
    </AppShell>
  );
}

export default App;
