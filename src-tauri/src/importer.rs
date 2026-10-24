use crate::exif;
use crate::models::{FailedFile, ImportSummary};
use crate::settings;
use crate::thumbs;
use crate::util;
use crate::AppState;
use rusqlite::{params, params_from_iter, Connection};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn import_photos(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
    source: Option<String>,
) -> Result<ImportSummary, String> {
    if paths.is_empty() {
        return Err("no paths provided".into());
    }
    let conn = state.db.lock().unwrap();
    import_files(&app, &conn, &paths, source.as_deref().unwrap_or("import"))
}

pub static IMPORT_CANCEL: AtomicBool = AtomicBool::new(false);
pub static EXPORT_CANCEL: AtomicBool = AtomicBool::new(false);

pub fn hash_exists(conn: &Connection, hash: &str) -> bool {
    conn.query_row("SELECT 1 FROM photos WHERE file_hash = ?1 LIMIT 1", [hash], |_| Ok(()))
        .is_ok()
}

pub fn import_files(app: &AppHandle, conn: &Connection, paths: &[String], source: &str) -> Result<ImportSummary, String> {
    IMPORT_CANCEL.store(false, Ordering::SeqCst);
    let library_root = settings::ensure_library_dirs(conn)?;
    let originals = library_root.join("Originals");
    let thumbs_dir = library_root.join("Thumbnails");
    let duplicate_mode = settings::get_or(conn, "duplicate_mode", "skip");

    let mut files: Vec<PathBuf> = Vec::new();
    for p in paths {
        util::collect_image_files(Path::new(p), &mut files);
    }
    let total = files.len();
    let mut summary = ImportSummary {
        total: total as u32,
        imported: 0,
        duplicates: 0,
        failed: 0,
        duplicate_files: Vec::new(),
        failed_files: Vec::new(),
        photo_ids: Vec::new(),
    };

    for (idx, src) in files.iter().enumerate() {
        if IMPORT_CANCEL.load(Ordering::SeqCst) {
            break;
        }
        let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        app.emit("import://progress", json!({"done": idx, "total": total, "current": name})).ok();
        match import_one(conn, src, &originals, &thumbs_dir, source, &duplicate_mode) {
            Ok(Some(id)) => {
                summary.imported += 1;
                summary.photo_ids.push(id);
            }
            Ok(None) => summary.duplicate_files.push(name),
            Err(e) => summary.failed_files.push(FailedFile { file: name, error: e }),
        }
    }
    summary.duplicates = summary.duplicate_files.len() as u32;
    summary.failed = summary.failed_files.len() as u32;
    app.emit("import://progress", json!({"done": total, "total": total, "current": ""})).ok();
    app.emit("library://changed", json!({"reason": "import", "imported": summary.imported})).ok();
    Ok(summary)
}

/// Ok(Some(id)) = imported, Ok(None) = duplicate skipped
fn import_one(
    conn: &Connection,
    src: &Path,
    originals: &Path,
    thumbs_dir: &Path,
    source: &str,
    duplicate_mode: &str,
) -> Result<Option<i64>, String> {
    let hash = util::sha256_file(src)?;
    if duplicate_mode == "skip" && hash_exists(conn, &hash) {
        return Ok(None);
    }

    let dims = image::ImageReader::open(src)
        .map_err(|e| format!("open: {e}"))?
        .into_dimensions()
        .map_err(|e| format!("inspect: {e}"))
        .map(|(w, h)| (w as i64, h as i64))?;

    let (exif_date, camera_model, extras) = exif::read_exif(src);
    let orientation = thumbs::read_orientation(src);
    let now = util::now_ms();
    let date_source = if exif_date.is_some() { "exif" } else { "imported" };

    // Destination: Originals/YYYY/MM/filename (year/month from capture date when known)
    let ts = exif_date.unwrap_or(now);
    let dt = chrono::DateTime::from_timestamp_millis(ts).unwrap_or_else(chrono::Utc::now);
    let month_dir = originals.join(dt.format("%Y").to_string()).join(dt.format("%m").to_string());
    std::fs::create_dir_all(&month_dir).map_err(|e| format!("mkdir: {e}"))?;
    let original_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "photo.jpg".into());
    let dest = util::unique_dest_path(&month_dir, &util::sanitize_filename(&original_name));

    // Write to temp file first, verify, then move (PRD 8.2)
    let tmp = dest.with_extension(format!(
        "{}.part",
        dest.extension().and_then(|e| e.to_str()).unwrap_or("tmp")
    ));
    std::fs::copy(src, &tmp).map_err(|e| format!("copy: {e}"))?;
    let copy_hash = util::sha256_file(&tmp)?;
    if copy_hash != hash {
        let _ = std::fs::remove_file(&tmp);
        return Err("copy integrity check failed".into());
    }
    std::fs::rename(&tmp, &dest).map_err(|e| format!("rename: {e}"))?;

    let thumbnail_path = thumbs::make_thumbnail(&dest, thumbs_dir, &hash, 512, orientation)
        .unwrap_or_default();
    let mime = util::mime_for_path(&dest);

    let mut metadata = extras;
    metadata["source"] = json!(source);
    if let Some(o) = orientation {
        metadata["orientation"] = json!(o);
    }

    conn.execute(
        "INSERT INTO photos (file_path, original_filename, file_hash, file_size, mime_type, width, height,
            captured_at, date_source, imported_at, camera_model, metadata_json, is_favorite, user_note, thumbnail_path, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, '', ?13, ?14)",
        params![
            dest.to_string_lossy(),
            original_name,
            hash,
            dest.metadata().map(|m| m.len() as i64).unwrap_or(0),
            mime,
            dims.0,
            dims.1,
            exif_date,
            date_source,
            now,
            camera_model,
            metadata.to_string(),
            thumbnail_path,
            source,
        ],
    )
    .map_err(|e| format!("db: {e}"))?;
    Ok(Some(conn.last_insert_rowid()))
}

/// Import a fully-received transfer file (already saved in the library) into the DB.
pub fn import_received_file(
    conn: &Connection,
    file: &Path,
    thumbs_dir: &Path,
    hash: &str,
) -> Result<Option<i64>, String> {
    if hash_exists(conn, hash) {
        return Ok(None);
    }
    let dims = image::ImageReader::open(file)
        .map_err(|e| format!("open: {e}"))?
        .into_dimensions()
        .map(|(w, h)| (w as i64, h as i64))
        .unwrap_or((0, 0));
    let (exif_date, camera_model, extras) = exif::read_exif(file);
    let orientation = thumbs::read_orientation(file);
    let now = util::now_ms();
    let date_source = if exif_date.is_some() { "exif" } else { "imported" };
    let thumbnail_path = thumbs::make_thumbnail(file, thumbs_dir, hash, 512, orientation).unwrap_or_default();
    let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut metadata = extras;
    metadata["source"] = json!("wireless");

    conn.execute(
        "INSERT INTO photos (file_path, original_filename, file_hash, file_size, mime_type, width, height,
            captured_at, date_source, imported_at, camera_model, metadata_json, is_favorite, user_note, thumbnail_path, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, '', ?13, 'wireless')",
        params![
            file.to_string_lossy(),
            name,
            hash,
            file.metadata().map(|m| m.len() as i64).unwrap_or(0),
            util::mime_for_path(file),
            dims.0,
            dims.1,
            exif_date,
            date_source,
            now,
            camera_model,
            metadata.to_string(),
            thumbnail_path,
        ],
    )
    .map_err(|e| format!("db: {e}"))?;
    Ok(Some(conn.last_insert_rowid()))
}

pub fn placeholders_for(ids: &[i64]) -> (String, Vec<rusqlite::types::Value>) {
    let marks: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let values: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
    (marks.join(","), values)
}

pub fn count_usage(conn: &Connection, ids: &[i64]) -> crate::models::UsageInfo {
    let (marks, values) = placeholders_for(ids);
    let albums = conn
        .query_row(
            &format!("SELECT COUNT(DISTINCT album_id) FROM album_photos WHERE photo_id IN ({marks})"),
            params_from_iter(values.iter()),
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let rolls = conn
        .query_row(
            &format!("SELECT COUNT(DISTINCT film_roll_id) FROM film_roll_photos WHERE photo_id IN ({marks})"),
            params_from_iter(values.iter()),
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let projects = count_projects_with_photos(conn, ids);
    crate::models::UsageInfo { albums, rolls, composer_projects: projects }
}

fn count_projects_with_photos(conn: &Connection, ids: &[i64]) -> i64 {
    let mut count = 0i64;
    if let Ok(mut stmt) = conn.prepare("SELECT project_json FROM composer_projects") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            let id_strs: Vec<String> = ids.iter().map(|i| i.to_string()).collect();
            for row in rows.flatten() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&row) {
                    if let Some(arr) = v.get("slots").and_then(|s| s.as_array()) {
                        if arr.iter().any(|s| {
                            s.get("photoId")
                                .and_then(|p| p.as_i64())
                                .map(|pid| id_strs.contains(&pid.to_string()))
                                .unwrap_or(false)
                        }) {
                            count += 1;
                        }
                    }
                }
            }
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_pipeline_and_duplicate_detection() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init(&conn).unwrap();
        let lib_root = std::env::temp_dir().join("xhalf-test-lib");
        let _ = std::fs::remove_dir_all(&lib_root);
        crate::settings::init_defaults(&conn, lib_root.clone()).unwrap();
        let root = crate::settings::ensure_library_dirs(&conn).unwrap();

        // Create a real test image
        let dir = std::env::temp_dir().join("xhalf-test-import");
        std::fs::create_dir_all(&dir).unwrap();
        let img_path = dir.join("test.png");
        image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(64, 48, image::Rgb([200, 180, 120])))
            .save_with_format(&img_path, image::ImageFormat::Png)
            .unwrap();

        let originals = root.join("Originals");
        let thumbs = root.join("Thumbnails");

        // First import succeeds and lands in the DB
        let id = import_one(&conn, &img_path, &originals, &thumbs, "import", "skip").unwrap();
        assert!(id.is_some());
        let (w, h, source, hash): (i64, i64, String, String) = conn
            .query_row(
                "SELECT width, height, source, file_hash FROM photos WHERE id = ?1",
                [id.unwrap()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((w, h), (64, 48));
        assert_eq!(source, "import");
        assert_eq!(hash.len(), 64); // sha-256 hex

        // The copied original exists and hashes back to the recorded value
        let stored_path: String = conn
            .query_row("SELECT file_path FROM photos WHERE id = ?1", [id.unwrap()], |r| r.get(0))
            .unwrap();
        assert!(std::path::Path::new(&stored_path).exists());
        assert_eq!(crate::util::sha256_file(std::path::Path::new(&stored_path)).unwrap(), hash);

        // Thumbnail was generated
        let thumb: String = conn
            .query_row("SELECT thumbnail_path FROM photos WHERE id = ?1", [id.unwrap()], |r| r.get(0))
            .unwrap();
        assert!(std::path::Path::new(&thumb).exists());

        // Second import of the same file is detected as a duplicate and skipped
        let id2 = import_one(&conn, &img_path, &originals, &thumbs, "import", "skip").unwrap();
        assert!(id2.is_none());
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM photos", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);

        // "keep" mode stores a second copy
        let id3 = import_one(&conn, &img_path, &originals, &thumbs, "import", "keep").unwrap();
        assert!(id3.is_some());
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM photos", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
