//! Generic SQL bridge between the React/TypeScript layer and SQLite.
//!
//! This module implements decision D30. It contains **no accounting
//! knowledge**: it does not know what a voucher, a period, a barangay or a
//! centavo is, and it must stay that way. All validation and business logic
//! lives in TypeScript, where the test suite and the golden trial-balance
//! test live. If accounting vocabulary ever appears in this file, the design
//! has gone wrong.
//!
//! Two commands:
//!
//! * `db_select` — runs one read and returns rows as **positional arrays**
//!   plus the column names. Positional is not a style choice: Drizzle's
//!   `sqlite-proxy` driver maps result columns by index, and the plugin's own
//!   `select` command returns name-keyed maps which silently collapse
//!   duplicate column names in a join (`a.id` and `b.id` both arrive as `id`).
//!
//! * `db_execute_batch` — runs an ordered list of statements inside **one
//!   transaction on one connection**: every statement commits, or none does.
//!   This is the entire reason the module exists. `tauri-plugin-sql` hands out
//!   a pooled connection per call, so a transaction driven as separate
//!   `begin` / write / `commit` calls (which is exactly how Drizzle's async
//!   proxy driver implements `transaction()`) can have its `BEGIN` land on one
//!   connection and its writes on another, half-committing a voucher with no
//!   error raised. `pool.begin()` here holds a single connection for the whole
//!   transaction, so that failure mode cannot occur.
//!
//! Both commands borrow the pool the SQL plugin already owns
//! (`tauri_plugin_sql::DbInstances`) rather than opening a second handle to
//! the same file — one database file, one owner.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Column, Row, TypeInfo, ValueRef};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

/// One statement in a batch: SQL text plus its bound parameters.
#[derive(Debug, Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    pub rows_affected: u64,
    pub last_insert_rowid: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
}

/// A structured failure. `statement_index` identifies which statement in a
/// batch failed (0-based), so the TypeScript side can report something more
/// useful than "the write failed".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    pub message: String,
    pub statement_index: Option<usize>,
}

impl BridgeError {
    fn new(message: impl Into<String>, statement_index: Option<usize>) -> Self {
        Self {
            message: message.into(),
            statement_index,
        }
    }
}

/// Binds JSON parameters with their natural SQLite types.
///
/// Integers are bound as `i64`, never as `f64`. Money in this system is an
/// integer number of centavos, and routing it through a float — as the SQL
/// plugin's own `execute`/`select` do — is the one thing the money rules
/// forbid outright.
fn bind_params<'q>(
    sql: &'q str,
    params: &'q [JsonValue],
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    let mut query = sqlx::query(sql);
    for param in params {
        query = match param {
            JsonValue::Null => query.bind(None::<i64>),
            JsonValue::Bool(b) => query.bind(i64::from(*b)),
            JsonValue::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query.bind(i)
                } else {
                    query.bind(n.as_f64().unwrap_or_default())
                }
            }
            JsonValue::String(s) => query.bind(s.as_str()),
            // Arrays and objects have no SQLite column type. Storing their JSON
            // text is the only lossless option, and matches how the audit log
            // already stores its before/after snapshots.
            other => query.bind(other.to_string()),
        };
    }
    query
}

/// Decodes one column of one row into JSON, preserving integer-ness.
fn column_to_json(row: &sqlx::sqlite::SqliteRow, index: usize) -> Result<JsonValue, BridgeError> {
    let raw = row
        .try_get_raw(index)
        .map_err(|e| BridgeError::new(e.to_string(), None))?;
    if raw.is_null() {
        return Ok(JsonValue::Null);
    }

    // Decode by the value's actual storage class. Trying `i64` first and
    // falling back would be wrong: SQLite is dynamically typed and happily
    // coerces the text "123" into the number 123, quietly changing an account
    // code into an integer.
    let decoded = match raw.type_info().name() {
        "INTEGER" | "BOOLEAN" => row.try_get::<i64, _>(index).map(JsonValue::from),
        "REAL" => row.try_get::<f64, _>(index).map(JsonValue::from),
        "BLOB" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|bytes| JsonValue::from(bytes.into_iter().map(JsonValue::from).collect::<Vec<_>>())),
        _ => row.try_get::<String, _>(index).map(JsonValue::from),
    };

    decoded.map_err(|e| BridgeError::new(e.to_string(), None))
}

/// Resolves the SQLite pool the SQL plugin already holds for `db`.
macro_rules! sqlite_pool {
    ($instances:expr, $db:expr) => {{
        let pool = $instances
            .get($db)
            .ok_or_else(|| BridgeError::new(format!("database `{}` is not loaded", $db), None))?;
        match pool {
            DbPool::Sqlite(pool) => pool,
            #[allow(unreachable_patterns)]
            _ => {
                return Err(BridgeError::new(
                    "the database bridge supports SQLite only",
                    None,
                ))
            }
        }
    }};
}

#[tauri::command]
pub async fn db_select(
    db_instances: State<'_, DbInstances>,
    db: String,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<SelectResult, BridgeError> {
    let instances = db_instances.0.read().await;
    let pool = sqlite_pool!(instances, &db);

    let rows = bind_params(&sql, &params)
        .fetch_all(pool)
        .await
        .map_err(|e| BridgeError::new(e.to_string(), None))?;

    let columns = rows
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        let mut values = Vec::with_capacity(row.columns().len());
        for index in 0..row.columns().len() {
            values.push(column_to_json(row, index)?);
        }
        out.push(values);
    }

    Ok(SelectResult { columns, rows: out })
}

/// Executes `statements` in order inside a single transaction on a single
/// connection. Any failure rolls the whole batch back and reports which
/// statement failed; nothing is left half-written.
#[tauri::command]
pub async fn db_execute_batch(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<Statement>,
) -> Result<Vec<StatementResult>, BridgeError> {
    let instances = db_instances.0.read().await;
    let pool = sqlite_pool!(instances, &db);

    // `begin()` takes ONE connection out of the pool and keeps it for the
    // lifetime of this transaction. Every statement below runs on that same
    // connection — this is the guarantee the whole module exists to provide.
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| BridgeError::new(e.to_string(), None))?;

    let mut results = Vec::with_capacity(statements.len());
    for (index, statement) in statements.iter().enumerate() {
        match bind_params(&statement.sql, &statement.params)
            .execute(&mut *tx)
            .await
        {
            Ok(result) => results.push(StatementResult {
                rows_affected: result.rows_affected(),
                last_insert_rowid: result.last_insert_rowid(),
            }),
            Err(e) => {
                // Explicit rollback rather than relying on the drop guard, so
                // the connection is returned to the pool in a known state.
                let _ = tx.rollback().await;
                return Err(BridgeError::new(e.to_string(), Some(index)));
            }
        }
    }

    tx.commit()
        .await
        .map_err(|e| BridgeError::new(e.to_string(), None))?;

    Ok(results)
}
