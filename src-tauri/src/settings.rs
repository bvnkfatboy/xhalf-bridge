use crate::AppState;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let conn = state.db.lock().unwrap();
    Ok(get_all(&conn))
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    if !KEYS.contains(&key.as_str()) {
        return Err(format!("unknown setting: {key}"));
    }
    let conn = state.db.lock().unwrap();
    set(&conn, &key, &value)?;
    if key == "library_root" {
        ensure_library_dirs(&conn)?;
    }
    Ok(())
}

pub const KEYS: &[&str] = &[
    "library_root",
    "transfer_port",
    "transfer_max_file_mb",
    "transfer_max_files",
    "transfer_token_ttl_min",
    "transfer_destination",
    "duplicate_mode",
    "theme",
    "export_quality",
    "language",
];

pub fn get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get::<_, String>(0))
        .ok()
}

pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
        [key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all(conn: &Connection) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM settings") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            for row in rows.flatten() {
                map.insert(row.0, row.1);
            }
        }
    }
    map
}

pub fn get_or(conn: &Connection, key: &str, default: &str) -> String {
    get(conn, key).unwrap_or_else(|| default.to_string())
}

pub fn get_i64(conn: &Connection, key: &str, default: i64) -> i64 {
    get(conn, key).and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// Seed defaults on first launch. `default_library_root` is `~/Pictures/Xhalf Bridge`.
pub fn init_defaults(conn: &Connection, default_library_root: PathBuf) -> Result<(), String> {
    let defaults: [(&str, String); 10] = [
        ("library_root", default_library_root.to_string_lossy().to_string()),
        ("transfer_port", "8737".into()),
        ("transfer_max_file_mb", "100".into()),
        ("transfer_max_files", "500".into()),
        ("transfer_token_ttl_min", "15".into()),
        ("transfer_destination", "originals".into()),
        ("duplicate_mode", "skip".into()),
        ("theme", "dark".into()),
        ("export_quality", "90".into()),
        ("language", "en".into()),
    ];
    for (k, v) in defaults {
        if get(conn, k).is_none() {
            set(conn, k, &v)?;
        }
    }
    Ok(())
}

pub fn ensure_library_dirs(conn: &Connection) -> Result<PathBuf, String> {
    let root = PathBuf::from(get_or(conn, "library_root", ""));
    std::fs::create_dir_all(root.join("Originals")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("Thumbnails")).map_err(|e| e.to_string())?;
    Ok(root)
}

pub fn originals_dir(conn: &Connection) -> PathBuf {
    let root = PathBuf::from(get_or(conn, "library_root", ""));
    match get_or(conn, "transfer_destination", "originals").as_str() {
        "originals" => root.join("Originals"),
        custom if !custom.is_empty() => PathBuf::from(custom),
        _ => root.join("Originals"),
    }
}
