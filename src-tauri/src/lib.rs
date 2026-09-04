mod db_bridge;

use tauri_plugin_sql::{Migration, MigrationKind};

/// The database file, resolved by the SQL plugin under the app's config dir.
/// Must stay identical to `APP_DB_URL` in `src/db/appDb.ts` — the plugin keys
/// its pool by this exact string and the bridge looks the pool up by it.
const DB_URL: &str = "sqlite:ebarangay.db";

/// The migrations in `drizzle/`, in `drizzle/meta/_journal.json` order.
///
/// They are embedded with `include_str!` rather than read from disk: on the
/// office PC there is no `drizzle/` directory beside the binary, only the
/// binary itself.
///
/// The plugin hands these to `sqlx::migrate::Migrator`, which records each
/// applied version (plus a checksum of its SQL) in its own `_sqlx_migrations`
/// table, inside the same transaction that applies the migration. So a second
/// launch re-runs nothing, and editing an already-applied file fails loudly
/// with a version mismatch instead of silently diverging.
///
/// Two things verified against sqlx 0.8.6's source rather than assumed:
///
/// * **Statements are not split naively on `;`.** Each migration is handed to
///   SQLite as one string (`tx.execute(&*migration.sql)`), and sqlx's SQLite
///   driver walks it with `sqlite3_prepare_v3` + the tail pointer — SQLite's
///   own parser decides where each statement ends. That is what keeps the four
///   `CREATE TRIGGER … BEGIN … END;` blocks in `0001` intact, semicolons in
///   their bodies and all. Drizzle's `--> statement-breakpoint` markers are
///   ordinary `--` line comments here and are simply ignored.
/// * **No `preload` in `tauri.conf.json`.** With migrations registered here,
///   the plugin's `load` command applies them when JS calls
///   `Database.load(DB_URL)` — which `createAppDb()` awaits before it issues
///   any query, so no JS can reach an unmigrated file. Preloading as well
///   would connect a *second* pool to the same file, which is exactly what
///   D30 rules out.
fn migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "0000_grey_tag",
      sql: include_str!("../../drizzle/0000_grey_tag.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "0001_enforce_append_only",
      sql: include_str!("../../drizzle/0001_enforce_append_only.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "0002_funny_titanium_man",
      sql: include_str!("../../drizzle/0002_funny_titanium_man.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "0003_tense_jazinda",
      sql: include_str!("../../drizzle/0003_tense_jazinda.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "0004_gifted_spencer_smythe",
      sql: include_str!("../../drizzle/0004_gifted_spencer_smythe.sql"),
      kind: MigrationKind::Up,
    },
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations(DB_URL, migrations())
        .build(),
    )
    // The generic SQL bridge (D30). The SQL plugin above owns the pool; these
    // two commands borrow it — one for reads, one for all-or-nothing writes.
    .invoke_handler(tauri::generate_handler![
      db_bridge::db_select,
      db_bridge::db_execute_batch
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        // An in-process W3C WebDriver server, so an end-to-end test can drive
        // the real window (macOS has no external WKWebView driver). Debug
        // builds only — it must never be reachable in a shipped binary.
        app.handle().plugin(tauri_plugin_wdio_webdriver::init())?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
