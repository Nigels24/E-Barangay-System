/**
 * The database handle type the engine functions operate on.
 *
 * Today this is the better-sqlite3 driver used by the test suite. When the
 * Tauri SQL plugin driver (sqlite-proxy, async) is wired up for the real
 * app, these engine functions will need an async-compatible handle — that
 * is a driver-layer concern for later, not something to design around now.
 */
export type { TestDb as EngineDb } from "../../db/testDb";
