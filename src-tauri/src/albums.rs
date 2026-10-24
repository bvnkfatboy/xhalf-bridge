use crate::models::{photo_from_row, AlbumDto, AlbumPhotoDto, ExportResult, FailedFile, PhotoDto};
use crate::AppState;
use rusqlite::{params, Connection};
use serde_json::json;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

fn row_to_album(row: &rusqlite::Row) -> rusqlite::Result<AlbumDto> {
    Ok(AlbumDto {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        cover_photo_id: row.get("cover_photo_id")?,
        cover_thumb: row.get("cover_thumb")?,
        photo_count: row.get("photo_count")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

const ALBUM_SELECT: &str = "SELECT a.*,
    (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = a.id) AS photo_count,
    (SELECT p.thumbnail_path FROM photos p WHERE p.id = a.cover_photo_id) AS cover_thumb
    FROM albums a";

#[tauri::command]
pub fn create_album(state: State<'_, AppState>, name: String, description: Option<String>) -> Result<AlbumDto, String> {
    let conn = state.db.lock().unwrap();
    let now = crate::util::now_ms();
    conn.execute(
        "INSERT INTO albums (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name.trim(), description.unwrap_or_default(), now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_album_row(&conn, id)
}

pub fn get_album_row(conn: &Connection, id: i64) -> Result<AlbumDto, String> {
    conn.query_row(&format!("{ALBUM_SELECT} WHERE a.id = ?1"), [id], row_to_album)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_albums(state: State<'_, AppState>) -> Result<Vec<AlbumDto>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(&format!("{ALBUM_SELECT} ORDER BY a.updated_at DESC")).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_album).map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn update_album(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    cover_photo_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    if let Some(n) = name {
        conn.execute("UPDATE albums SET name = ?1 WHERE id = ?2", params![n.trim(), id]).map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute("UPDATE albums SET description = ?1 WHERE id = ?2", params![d, id]).map_err(|e| e.to_string())?;
    }
    if let Some(c) = cover_photo_id {
        conn.execute("UPDATE albums SET cover_photo_id = ?1 WHERE id = ?2", params![c, id]).map_err(|e| e.to_string())?;
    }
    conn.execute("UPDATE albums SET updated_at = ?1 WHERE id = ?2", params![crate::util::now_ms(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_album(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM albums WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_album_photos(state: State<'_, AppState>, album_id: i64) -> Result<Vec<AlbumPhotoDto>, String> {
    let conn = state.db.lock().unwrap();
    get_album_photos_impl(&conn, album_id)
}

pub fn get_album_photos_impl(conn: &Connection, album_id: i64) -> Result<Vec<AlbumPhotoDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.*, ap.sort_order AS ap_sort FROM album_photos ap
             JOIN photos p ON p.id = ap.photo_id WHERE ap.album_id = ?1 ORDER BY ap.sort_order, ap.added_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([album_id], |r| {
            Ok(AlbumPhotoDto { photo: photo_from_row(r)?, sort_order: r.get("ap_sort")? })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn add_album_photos(state: State<'_, AppState>, album_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let now = crate::util::now_ms();
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM album_photos WHERE album_id = ?1",
            [album_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    for (i, pid) in photo_ids.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id, sort_order, added_at) VALUES (?1, ?2, ?3, ?4)",
            params![album_id, pid, next + i as i64, now],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute("UPDATE albums SET updated_at = ?1 WHERE id = ?2", params![now, album_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_album_photos(state: State<'_, AppState>, album_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    for pid in photo_ids {
        conn.execute("DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2", params![album_id, pid])
            .map_err(|e| e.to_string())?;
    }
    conn.execute("UPDATE albums SET updated_at = ?1 WHERE id = ?2", params![crate::util::now_ms(), album_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_album_photos(state: State<'_, AppState>, album_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    for (i, pid) in photo_ids.iter().enumerate() {
        conn.execute(
            "UPDATE album_photos SET sort_order = ?1 WHERE album_id = ?2 AND photo_id = ?3",
            params![i as i64, album_id, pid],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_album(
    state: State<'_, AppState>,
    app: AppHandle,
    album_id: i64,
    dest_path: String,
    as_zip: bool,
) -> Result<ExportResult, String> {
    let conn = state.db.lock().unwrap();
    let album = get_album_row(&conn, album_id)?;
    let photos: Vec<PhotoDto> = get_album_photos_impl(&conn, album_id)?
        .into_iter()
        .map(|ap| ap.photo)
        .collect();
    drop(conn);

    let album_name = crate::util::sanitize_filename(&album.name);
    let mut result = ExportResult { exported: 0, failed: 0, cancelled: false, failed_files: Vec::new() };
    let total = photos.len();

    if as_zip {
        let zip_path = PathBuf::from(&dest_path).join(format!("{album_name}.zip"));
        let file = std::fs::File::create(&zip_path).map_err(|e| format!("create zip: {e}"))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        for (i, p) in photos.iter().enumerate() {
            app.emit("export://progress", json!({"done": i, "total": total, "current": p.original_filename})).ok();
            let src = PathBuf::from(&p.file_path);
            match std::fs::File::open(&src) {
                Ok(mut f) => {
                    let name = unique_zip_name(&photos, i);
                    if zip.start_file(format!("{album_name}/{name}"), options).is_ok() {
                        std::io::copy(&mut f, &mut zip).ok();
                        zip.flush().ok();
                        result.exported += 1;
                    } else {
                        result.failed += 1;
                    }
                }
                Err(e) => {
                    result.failed += 1;
                    result.failed_files.push(FailedFile { file: p.original_filename.clone(), error: e.to_string() });
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
    } else {
        let dest = PathBuf::from(&dest_path).join(&album_name);
        std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        for (i, p) in photos.iter().enumerate() {
            app.emit("export://progress", json!({"done": i, "total": total, "current": p.original_filename})).ok();
            let src = Path::new(&p.file_path);
            if !src.exists() {
                result.failed += 1;
                result.failed_files.push(FailedFile { file: p.original_filename.clone(), error: "file missing".into() });
                continue;
            }
            let target = crate::util::unique_dest_path(&dest, &p.original_filename);
            match std::fs::copy(src, &target) {
                Ok(_) => result.exported += 1,
                Err(e) => {
                    result.failed += 1;
                    result.failed_files.push(FailedFile { file: p.original_filename.clone(), error: e.to_string() });
                }
            }
        }
    }
    Ok(result)
}

fn unique_zip_name(photos: &[PhotoDto], idx: usize) -> String {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for p in photos.iter().take(idx) {
        seen.insert(p.original_filename.clone());
    }
    let name = &photos[idx].original_filename;
    if seen.contains(name) {
        format!("{}-{name}", idx + 1)
    } else {
        name.clone()
    }
}
