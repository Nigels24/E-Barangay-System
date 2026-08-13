/**
 * The one seam between the accounting engine and SQLite (decision D30).
 *
 * The engine never talks to a driver directly. It talks to an `EngineDb`,
 * which has exactly two capabilities:
 *
 *   `query`      — Drizzle, for reads and for *building* SQL. Async, because
 *                  the real app reaches the database across an IPC boundary.
 *   `writeBatch` — an ordered list of statements executed as one all-or-nothing
 *                  transaction on one connection.
 *
 * Two implementations satisfy it: `createTestDb()` (better-sqlite3, in-memory,
 * used by the whole test suite) and `createAppDb()` (Tauri). Both are
 * deliberately dumb — they execute the `{ sql, params }` list they are handed
 * and nothing else. Every decision about *what* to write is made once, in the
 * engine, in TypeScript, under test. That is what makes a passing test suite
 * evidence about the shipped app rather than about the test driver.
 *
 * ### Why writes go through a batch instead of `query.transaction()`
 *
 * Drizzle's async proxy driver implements `transaction()` as separate `begin`,
 * statement, and `commit` calls (see `drizzle-orm/sqlite-proxy/session.js`).
 * `tauri-plugin-sql` serves each call from a connection *pool*, so those calls
 * can land on different connections — `BEGIN` on one, the writes on another —
 * and a voucher can half-commit with no error raised. Never call
 * `query.transaction()`. Use `writeBatch`.
 *
 * A single statement needs no batch: SQLite wraps a lone statement in its own
 * implicit transaction, so `query.insert(...).run()` is already atomic. The
 * batch exists for sequences that must succeed or fail together.
 */
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type * as schema from "./schema";

/** A statement ready to execute: SQL text plus its bound parameters. */
export interface BatchStatement {
  sql: string;
  params: unknown[];
}

export interface BatchStatementResult {
  rowsAffected: number;
  lastInsertRowid: number;
}

export interface EngineDb {
  /** Reads, and Drizzle's typed query building. Never call `.transaction()` on this. */
  readonly query: SqliteRemoteDatabase<typeof schema>;
  /** Executes every statement in one transaction on one connection, or none of them. */
  writeBatch(statements: BatchStatement[]): Promise<BatchStatementResult[]>;
}

/** Anything Drizzle can compile to SQL without running it. */
interface Compilable {
  toSQL(): { sql: string; params: unknown[] };
}

/**
 * Compiles a Drizzle query builder into a batchable statement **without
 * executing it**. This is what lets the engine keep Drizzle's typed, schema-
 * checked query building and still hand the write side a flat statement list.
 */
export function statement(builder: Compilable): BatchStatement {
  const { sql, params } = builder.toSQL();
  return { sql, params };
}

/**
 * Thrown when a write batch fails. The batch left the database untouched.
 */
export class WriteBatchError extends Error {
  /** 0-based index of the statement that failed, when the driver reports it. */
  readonly statementIndex: number | undefined;

  constructor(message: string, statementIndex?: number) {
    super(message);
    this.name = "WriteBatchError";
    this.statementIndex = statementIndex;
  }
}
