use crate::importer::EXPORT_CANCEL;
use crate::models::{photo_from_row, ExportResult, FailedFile};
use crate::AppState;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// Export selected photos to a folder, optionally transcoding format.
#[tauri::command]
pub fn export_photos(
    state: State<'_, AppState>,
    app: AppHandle,
    ids: Vec<i64>,
    dest_path: String,
    format: Option<String>,
    quality: Option<u8>,
) -> Result<ExportResult, String> {
    EXPORT_CANCEL.store(false, Ordering::SeqCst);
    let dest = PathBuf::from(&dest_path);
    std::fs::create_dir_all(&dest).map_err(|e| format!("mkdir: {e}"))?;
    let fmt = format.as_deref().unwrap_or("original");
    let quality = quality.unwrap_or(90);

    let conn = state.db.lock().unwrap();
    let mut photos = Vec::new();
    for id in &ids {
        match conn.query_row("SELECT * FROM photos WHERE id = ?1", [id], photo_from_row) {
            Ok(p) => photos.push(p),
            Err(_) => photos.push(missing_photo_dto(id)),
        }
    }
    drop(conn);

    let total = photos.len();
    let mut result = ExportResult { exported: 0, failed: 0, cancelled: false, failed_files: Vec::new() };
    for (i, p) in photos.iter().enumerate() {
        if EXPORT_CANCEL.load(Ordering::SeqCst) {
            result.cancelled = true;
            break;
        }
        app.emit("export://progress", json!({"done": i, "total": total, "current": p.original_filename})).ok();
        if p.id == -1 {
            continue;
        }
        let src = Path::new(&p.file_path);
        if !src.exists() {
            result.failed += 1;
            result.failed_files.push(FailedFile { file: p.original_filename.clone(), error: "file missing in library".into() });
            continue;
        }
        let ext = match fmt {
            "jpeg" | "jpg" => "jpg",
            "png" => "png",
            _ => src.extension().and_then(|e| e.to_str()).unwrap_or("jpg"),
        };
        let stem = Path::new(&p.original_filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("photo");
        let target = crate::util::unique_dest_path(&dest, &format!("{stem}.{ext}"));
        let outcome: Result<(), String> = if fmt == "original" {
            std::fs::copy(src, &target).map(|_| ()).map_err(|e| e.to_string())
        } else {
            crate::thumbs::encode_file(src, &target, fmt, quality)
        };
        match outcome {
            Ok(()) => result.exported += 1,
            Err(e) => {
                let _ = std::fs::remove_file(&target);
                result.failed += 1;
                result.failed_files.push(FailedFile { file: p.original_filename.clone(), error: e });
            }
        }
    }
    app.emit("export://progress", json!({"done": total, "total": total, "current": ""})).ok();
    Ok(result)
}

fn missing_photo_dto(id: &i64) -> crate::models::PhotoDto {
    crate::models::PhotoDto {
        id: *id,
        file_path: String::new(),
        original_filename: format!("<missing id {id}>"),
        file_hash: String::new(),
        file_size: 0,
        mime_type: String::new(),
        width: 0,
        height: 0,
        captured_at: None,
        date_source: String::new(),
        imported_at: 0,
        camera_model: None,
        metadata: json!({}),
        is_favorite: false,
        user_note: String::new(),
        thumbnail_path: String::new(),
        source: String::new(),
    }
}

#[tauri::command]
pub fn cancel_export() {
    EXPORT_CANCEL.store(true, Ordering::SeqCst);
}
