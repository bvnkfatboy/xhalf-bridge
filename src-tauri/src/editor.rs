use crate::models::PhotoDto;
use crate::AppState;
use rusqlite::params;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

/* ---------- non-destructive edit recipes ---------- */

#[tauri::command]
pub fn get_photo_edit(state: State<'_, AppState>, photo_id: i64) -> Result<Option<Value>, String> {
    let conn = state.db.lock().unwrap();
    let json_str: Option<String> = conn
        .query_row(
            "SELECT settings_json FROM photo_edits WHERE photo_id = ?1",
            [photo_id],
            |r| r.get(0),
        )
        .ok();
    Ok(json_str.and_then(|s| serde_json::from_str(&s).ok()))
}

#[tauri::command]
pub fn save_photo_edit(state: State<'_, AppState>, photo_id: i64, settings: Value) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO photo_edits (photo_id, settings_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(photo_id) DO UPDATE SET settings_json = ?2, updated_at = ?3",
        params![photo_id, settings.to_string(), crate::util::now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_photo_edit(state: State<'_, AppState>, photo_id: i64) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM photo_edits WHERE photo_id = ?1", [photo_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- user presets ---------- */

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPresetDto {
    pub id: i64,
    pub name: String,
    pub settings: Value,
    pub created_at: i64,
}

#[tauri::command]
pub fn list_editor_presets(state: State<'_, AppState>) -> Result<Vec<EditorPresetDto>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, settings_json, created_at FROM edit_presets ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let json_str: String = r.get(2)?;
            Ok(EditorPresetDto {
                id: r.get(0)?,
                name: r.get(1)?,
                settings: serde_json::from_str(&json_str).unwrap_or(Value::Null),
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn save_editor_preset(state: State<'_, AppState>, name: String, settings: Value) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO edit_presets (name, settings_json, created_at) VALUES (?1, ?2, ?3)",
        params![name.trim(), settings.to_string(), crate::util::now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn delete_editor_preset(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM edit_presets WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- custom LUT files ---------- */

fn luts_dir(state: &State<'_, AppState>) -> PathBuf {
    state
        .db_path
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .join("luts")
}

#[tauri::command]
pub fn import_lut(state: State<'_, AppState>, source_path: String) -> Result<String, String> {
    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err("file not found".into());
    }
    if src.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() != Some("cube") {
        return Err("only .cube LUT files are supported".into());
    }
    let dir = luts_dir(&state);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = crate::util::sanitize_filename(&src.file_name().unwrap_or_default().to_string_lossy());
    let dest = crate::util::unique_dest_path(&dir, &name);
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

#[tauri::command]
pub fn list_custom_luts(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let dir = luts_dir(&state);
    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()).as_deref() == Some("cube") {
                if let Some(n) = p.file_stem().and_then(|s| s.to_str()) {
                    names.push(n.to_string());
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn delete_lut(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let dir = luts_dir(&state);
    let safe = crate::util::sanitize_filename(&name);
    let path = dir.join(format!("{safe}.cube"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Read a custom LUT's text content so the frontend can parse it.
#[tauri::command]
pub fn read_custom_lut(state: State<'_, AppState>, name: String) -> Result<String, String> {
    let dir = luts_dir(&state);
    let safe = crate::util::sanitize_filename(&name);
    let path = dir.join(format!("{safe}.cube"));
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/* ---------- saving the edited render ---------- */

/// Save a rendered edit (data URL from the WebGL canvas) as a new library photo.
#[tauri::command]
pub fn add_rendered_photo(
    app: AppHandle,
    state: State<'_, AppState>,
    data_url: String,
    parent_id: Option<i64>,
) -> Result<PhotoDto, String> {
    use base64::Engine as _;
    let (mime, b64) = data_url.split_once(";base64,").ok_or("invalid data url")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("decode: {e}"))?;
    if bytes.is_empty() {
        return Err("empty render".into());
    }
    let ext = if mime.contains("png") { "png" } else { "jpg" };

    let conn = state.db.lock().unwrap();
    let library_root = crate::settings::ensure_library_dirs(&conn)?;
    let originals = library_root.join("Originals");
    let thumbs_dir = library_root.join("Thumbnails");

    let now = crate::util::now_ms();
    let parent_captured = parent_id
        .and_then(|pid| {
            conn.query_row("SELECT captured_at FROM photos WHERE id = ?1", [pid], |r| r.get::<_, Option<i64>>(0))
                .ok()
        })
        .flatten();

    // Hash the rendered bytes and check duplicates against the library
    use sha2::Digest;
    let hash = format!("{:x}", sha2::Sha256::digest(&bytes));
    if crate::importer::hash_exists(&conn, &hash) {
        return Err("an identical photo already exists in the library".into());
    }

    let dims = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_dimensions()
        .map_err(|e| format!("inspect: {e}"))
        .map(|(w, h)| (w as i64, h as i64))?;

    let dt = chrono::DateTime::from_timestamp_millis(parent_captured.unwrap_or(now)).unwrap_or_else(chrono::Utc::now);
    let month_dir = originals.join(dt.format("%Y").to_string()).join(dt.format("%m").to_string());
    std::fs::create_dir_all(&month_dir).map_err(|e| e.to_string())?;

    let parent_name = parent_id
        .and_then(|pid| {
            conn.query_row("SELECT original_filename FROM photos WHERE id = ?1", [pid], |r| r.get::<_, String>(0))
                .ok()
        })
        .unwrap_or_else(|| "edit".into());
    let stem = std::path::Path::new(&parent_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("edit");
    let dest = crate::util::unique_dest_path(&month_dir, &format!("{stem}-edit.{ext}"));

    // Write temp first, verify, then rename (same safety as import)
    let tmp = dest.with_extension(format!("{}.part", dest.extension().and_then(|e| e.to_str()).unwrap_or("tmp")));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let tmp_hash = crate::util::sha256_file(&tmp)?;
    if tmp_hash != hash {
        let _ = std::fs::remove_file(&tmp);
        return Err("render integrity check failed".into());
    }
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;

    let thumbnail_path = crate::thumbs::make_thumbnail(&dest, &thumbs_dir, &hash, 512, None).unwrap_or_default();

    let mut metadata = json!({ "source": "edited" });
    if let Some(pid) = parent_id {
        metadata["editedFrom"] = json!(pid);
    }

    conn.execute(
        "INSERT INTO photos (file_path, original_filename, file_hash, file_size, mime_type, width, height,
            captured_at, date_source, imported_at, camera_model, metadata_json, is_favorite, user_note, thumbnail_path, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'imported', ?9, NULL, ?10, 0, '', ?11, 'edited')",
        params![
            dest.to_string_lossy(),
            dest.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            hash,
            bytes.len() as i64,
            if ext == "png" { "image/png" } else { "image/jpeg" },
            dims.0,
            dims.1,
            parent_captured,
            now,
            metadata.to_string(),
            thumbnail_path,
        ],
    )
    .map_err(|e| format!("db: {e}"))?;
    let id = conn.last_insert_rowid();
    drop(conn);

    app.emit("library://changed", json!({"reason": "edited-copy", "imported": 1, "id": id})).ok();
    get_photo_by_id(&state, id)
}

fn get_photo_by_id(state: &State<'_, AppState>, id: i64) -> Result<PhotoDto, String> {
    let conn = state.db.lock().unwrap();
    conn.query_row("SELECT * FROM photos WHERE id = ?1", [id], crate::models::photo_from_row)
        .map_err(|e| e.to_string())
}
