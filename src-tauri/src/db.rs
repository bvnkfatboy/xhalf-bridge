use rusqlite::Connection;

pub const MIGRATIONS: &[&str] = &[
    // 001 — initial schema
    r#"
    CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        original_filename TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT NOT NULL DEFAULT '',
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        captured_at INTEGER,
        date_source TEXT NOT NULL DEFAULT 'imported',
        imported_at INTEGER NOT NULL,
        camera_model TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        user_note TEXT NOT NULL DEFAULT '',
        thumbnail_path TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'import'
    );
    CREATE INDEX IF NOT EXISTS idx_photos_hash ON photos(file_hash);
    CREATE INDEX IF NOT EXISTS idx_photos_imported ON photos(imported_at);
    CREATE INDEX IF NOT EXISTS idx_photos_captured ON photos(captured_at);
    CREATE INDEX IF NOT EXISTS idx_photos_name ON photos(original_filename);

    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cover_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_photos (
        album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (album_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS film_rolls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        target_frames INTEGER NOT NULL DEFAULT 36,
        start_date INTEGER,
        end_date INTEGER,
        cover_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS film_roll_photos (
        film_roll_id INTEGER NOT NULL REFERENCES film_rolls(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        frame_number INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (film_roll_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS composer_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        project_json TEXT NOT NULL DEFAULT '{}',
        canvas_width INTEGER NOT NULL DEFAULT 3000,
        canvas_height INTEGER NOT NULL DEFAULT 2000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfer_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_device TEXT NOT NULL DEFAULT 'mobile',
        destination_path TEXT NOT NULL DEFAULT '',
        total_files INTEGER NOT NULL DEFAULT 0,
        completed_files INTEGER NOT NULL DEFAULT 0,
        failed_files INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL,
        completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS backup_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        destination_path TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'running',
        files_processed INTEGER NOT NULL DEFAULT 0,
        files_failed INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    // 002 — photo editor: non-destructive edit recipes and user presets
    r#"
    CREATE TABLE IF NOT EXISTS photo_edits (
        photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edit_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
    );
    "#,
];

pub fn init(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL").map_err(|e| e.to_string())?;

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);

    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let target = (i + 1) as i64;
        if version < target {
            conn.execute_batch(migration).map_err(|e| format!("migration {target}: {e}"))?;
            conn.execute_batch(&format!("PRAGMA user_version = {target}"))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Compact copy of the database into `dest` (used by backup before copying files).
pub fn vacuum_into(conn: &Connection, dest: &str) -> Result<(), String> {
    let escaped = dest.replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{escaped}'"))
        .map_err(|e| e.to_string())
}
