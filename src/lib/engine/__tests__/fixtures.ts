import { createTestDb } from "../../../db/testDb";
import { account, appUser, barangay } from "../../../db/schema";
import { ensurePeriod } from "../period";

/** A minimal but realistic seed: one barangay, one user, a small chart of accounts. */
export function seedEngineFixture() {
  const db = createTestDb();

  const b = db.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const user = db
    .insert(appUser)
    .values({ username: "bookkeeper", passwordHash: "x", fullName: "Eugenie Manosur", role: "bookkeeper" })
    .returning()
    .get();
  const admin = db
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Peter Paul Cotingjo", role: "admin" })
    .returning()
    .get();

  const cashInBank = db
    .insert(account)
    .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
    .returning()
    .get();
  const equity = db
    .insert(account)
    .values({ code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" })
    .returning()
    .get();
  const ira = db
    .insert(account)
    .values({ code: "4-04-04-010", name: "Share from IRA", accountType: "income", normalBalance: "credit" })
    .returning()
    .get();
  const electricity = db
    .insert(account)
    .values({ code: "5-02-04-020", name: "Electricity Expense", accountType: "expense", normalBalance: "debit" })
    .returning()
    .get();

  const jan2024 = ensurePeriod(db, b.id, 2024, 1);
  const feb2024 = ensurePeriod(db, b.id, 2024, 2);

  return { db, barangay: b, user, admin, accounts: { cashInBank, equity, ira, electricity }, periods: { jan2024, feb2024 } };
}
