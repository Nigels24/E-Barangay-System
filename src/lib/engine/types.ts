/**
 * The database handle the engine operates on.
 *
 * Per decision D30 this is no longer a driver but a two-capability seam:
 * `query` for reads and typed SQL building, `writeBatch` for all-or-nothing
 * writes. The test suite and the desktop app each supply their own
 * implementation — see `src/db/adapter.ts` for the contract and why writes
 * cannot go through Drizzle's own `transaction()`.
 */
export type { EngineDb, BatchStatement, BatchStatementResult } from "../../db/adapter";
export { statement, WriteBatchError } from "../../db/adapter";
