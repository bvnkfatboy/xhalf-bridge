use crate::importer;
use crate::models::{photo_from_row, PhotoDto, UsageInfo};
use crate::AppState;
use rusqlite::{params, params_from_iter, Connection};
use serde_json::json;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

fn sort_expr(sort: &str) -> &'static str {
    match sort {
        "name" => "original_filename COLLATE NOCASE",
        "size" => "file_size",
        "imported" => "imported_at",
        _ => "COALESCE(captured_at, imported_at)",
    }
}

#[tauri::command]
pub fn list_photos(
    state: State<'_, AppState>,
    query: Option<String>,
    sort: Option<String>,
    desc: Option<bool>,
    favorites_only: Option<bool>,
    date_from: Option<i64>,
    date_to: Option<i64>,
) -> Result<Vec<PhotoDto>, String> {
    let conn = state.db.lock().unwrap();
    list_photos_impl(&conn, query, sort, desc, favorites_only, date_from, date_to)
}

pub fn list_photos_impl(
    conn: &Connection,
    query: Option<String>,
    sort: Option<String>,
    desc: Option<bool>,
    favorites_only: Option<bool>,
    date_from: Option<i64>,
    date_to: Option<i64>,
) -> Result<Vec<PhotoDto>, String> {
    let mut sql = String::from("SELECT * FROM photos WHERE 1=1");
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(q) = query.as_ref().filter(|q| !q.trim().is_empty()) {
        let like = format!("%{}%", q.trim());
        sql.push_str(
            " AND (original_filename LIKE ? OR EXISTS (
                SELECT 1 FROM album_photos ap JOIN albums a ON a.id = ap.album_id
                WHERE ap.photo_id = photos.id AND a.name LIKE ?))",
        );
        values.push(rusqlite::types::Value::Text(like.clone()));
        values.push(rusqlite::types::Value::Text(like));
    }
    if favorites_only.unwrap_or(false) {
        sql.push_str(" AND is_favorite = 1");
    }
    if let Some(from) = date_from {
        sql.push_str(" AND COALESCE(captured_at, imported_at) >= ?");
        values.push(rusqlite::types::Value::Integer(from));
    }
    if let Some(to) = date_to {
        sql.push_str(" AND COALESCE(captured_at, imported_at) <= ?");
        values.push(rusqlite::types::Value::Integer(to));
    }
    let dir = if desc.unwrap_or(true) { "DESC" } else { "ASC" };
    sql.push_str(&format!(" ORDER BY {} {}", sort_expr(sort.as_deref().unwrap_or("captured")), dir));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), photo_from_row)
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn get_photo(state: State<'_, AppState>, id: i64) -> Result<PhotoDto, String> {
    let conn = state.db.lock().unwrap();
    conn.query_row("SELECT * FROM photos WHERE id = ?1", [id], photo_from_row)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_photo(
    state: State<'_, AppState>,
    id: i64,
    is_favorite: Option<bool>,
    user_note: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    if let Some(fav) = is_favorite {
        conn.execute("UPDATE photos SET is_favorite = ?1 WHERE id = ?2", params![fav as i64, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(note) = user_note {
        conn.execute("UPDATE photos SET user_note = ?1 WHERE id = ?2", params![note, id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_photo_usage(state: State<'_, AppState>, ids: Vec<i64>) -> Result<UsageInfo, String> {
    if ids.is_empty() {
        return Ok(UsageInfo { albums: 0, rolls: 0, composer_projects: 0 });
    }
    let conn = state.db.lock().unwrap();
    Ok(importer::count_usage(&conn, &ids))
}

#[tauri::command]
pub fn remove_photos(
    state: State<'_, AppState>,
    app: AppHandle,
    ids: Vec<i64>,
    delete_files: bool,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let (marks, values) = importer::placeholders_for(&ids);
    let mut paths: Vec<(String, String)> = Vec::new();
    if delete_files {
        let sql = format!("SELECT file_path, thumbnail_path FROM photos WHERE id IN ({marks})");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_from_iter(values.iter()), |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            paths.push(row);
        }
    }
    conn.execute(
        &format!("DELETE FROM photos WHERE id IN ({marks})"),
        params_from_iter(values.iter()),
    )
    .map_err(|e| e.to_string())?;
    drop(conn);
    if delete_files {
        for (file, thumb) in paths {
            let _ = std::fs::remove_file(PathBuf::from(&file));
            if !thumb.is_empty() {
                let _ = std::fs::remove_file(PathBuf::from(&thumb));
            }
        }
    }
    app.emit("library://changed", json!({"reason": "removed", "count": ids.len()})).ok();
    Ok(())
}

#[tauri::command]
pub fn cancel_import() {
    importer::IMPORT_CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
pub fn get_storage_info(state: State<'_, AppState>) -> Result<crate::models::StorageInfo, String> {
    let conn = state.db.lock().unwrap();
    let root = PathBuf::from(crate::settings::get_or(&conn, "library_root", ""));
    let db_size = std::fs::metadata(&state.db_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);
    let free = fs2::available_space(&root).ok().map(|v| v as i64);
    Ok(crate::models::StorageInfo {
        originals_bytes: crate::util::dir_size(&root.join("Originals")),
        thumbnails_bytes: crate::util::dir_size(&root.join("Thumbnails")),
        database_bytes: db_size,
        free_bytes: free,
        library_root: root.to_string_lossy().to_string(),
    })
}
