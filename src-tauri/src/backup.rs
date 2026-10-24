use crate::models::{BackupJobDto, FailedFile};
use crate::AppState;
use rusqlite::params;
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

/// Run a full backup: photos (verified by hash) + a compact database copy + manifest.
#[tauri::command]
pub fn run_backup(
    state: State<'_, AppState>,
    app: AppHandle,
    dest_path: String,
) -> Result<BackupJobDto, String> {
    let dest = PathBuf::from(&dest_path);
    std::fs::create_dir_all(&dest).map_err(|e| format!("create destination: {e}"))?;

    let conn = state.db.lock().unwrap();
    let library_root = crate::settings::ensure_library_dirs(&conn)?;

    // Collect photo list first
    let mut stmt = conn
        .prepare("SELECT id, file_path, file_hash, original_filename FROM photos ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    // Size + free space pre-check
    let mut total_bytes: i64 = 0;
    let mut missing = 0;
    for (_, path, _, _) in &rows {
        match std::fs::metadata(path) {
            Ok(m) => total_bytes += m.len() as i64,
            Err(_) => missing += 1,
        }
    }
    let free_bytes = fs2::available_space(&dest).ok().map(|v| v as i64);
    if let Some(free) = free_bytes {
        if (free as i64) < total_bytes + 64 * 1024 * 1024 {
            return Err(format!(
                "insufficient space: need ~{}, only {} available at destination",
                human(total_bytes),
                human(free as i64)
            ));
        }
    }

    let stamp = chrono::Local::now().format("XhalfBridge-Backup-%Y%m%d-%H%M%S");
    let backup_dir = dest.join(stamp.to_string());
    let photos_dir = backup_dir.join("photos");
    let db_dir = backup_dir.join("database");
    std::fs::create_dir_all(&photos_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO backup_jobs (destination_path, status, started_at) VALUES (?1, 'running', ?2)",
        params![backup_dir.to_string_lossy(), crate::util::now_ms()],
    )
    .map_err(|e| e.to_string())?;
    let job_id = conn.last_insert_rowid();

    let run = (|| -> Result<(), String> {
        // 1. Database copy (compact snapshot via VACUUM INTO)
        crate::db::vacuum_into(&conn, &db_dir.join("xhalf.db").to_string_lossy())?;

        // 2. Copy + verify photos
        let total = rows.len();
        let mut processed = 0i64;
        let mut failed = 0i64;
        let mut manifest_files: Vec<serde_json::Value> = Vec::new();
        for (i, (id, path, hash, name)) in rows.iter().enumerate() {
            if crate::importer::EXPORT_CANCEL.load(std::sync::atomic::Ordering::SeqCst) {
                return Err("cancelled".into());
            }
            app.emit("backup://progress", json!({"done": i, "total": total, "current": name})).ok();
            let src = Path::new(path);
            if !src.exists() {
                failed += 1;
                continue;
            }
            let rel = match Path::new(path).strip_prefix(&library_root) {
                Ok(r) => r.to_path_buf(),
                Err(_) => PathBuf::from(format!("flat/{hash}.jpg")),
            };
            let target = photos_dir.join(&rel);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
            }
            std::fs::copy(src, &target).map_err(|e| format!("copy {name}: {e}"))?;
            let copied = crate::util::sha256_file(&target)?;
            if copied != *hash {
                let _ = std::fs::remove_file(&target);
                return Err(format!("integrity check failed for {name}"));
            }
            processed += 1;
            manifest_files.push(json!({"id": id, "file": rel.to_string_lossy(), "hash": hash}));
        }

        // 3. Manifest
        let manifest = json!({
            "app": "Xhalf Bridge",
            "version": "0.1.0",
            "created_at": crate::util::now_ms(),
            "library_root": library_root.to_string_lossy(),
            "photo_count": processed,
            "photos_failed": failed,
            "photos_missing_at_source": missing,
            "files": manifest_files,
        });
        std::fs::write(backup_dir.join("manifest.json"), serde_json::to_string_pretty(&manifest).unwrap())
            .map_err(|e| format!("write manifest: {e}"))?;

        conn.execute(
            "UPDATE backup_jobs SET status = 'completed', files_processed = ?1, files_failed = ?2, total_bytes = ?3, completed_at = ?4 WHERE id = ?5",
            params![processed, failed, total_bytes, crate::util::now_ms(), job_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();

    match run {
        Ok(()) => {
            let dto = get_backup_job(&conn, job_id)?;
            app.emit("backup://done", json!({"jobId": job_id, "ok": true})).ok();
            Ok(dto)
        }
        Err(e) => {
            conn.execute(
                "UPDATE backup_jobs SET status = 'failed', completed_at = ?1 WHERE id = ?2",
                params![crate::util::now_ms(), job_id],
            )
            .ok();
            Err(e)
        }
    }
}

fn get_backup_job(conn: &rusqlite::Connection, id: i64) -> Result<BackupJobDto, String> {
    conn.query_row(
        "SELECT id, destination_path, status, files_processed, files_failed, total_bytes, started_at, completed_at
         FROM backup_jobs WHERE id = ?1",
        [id],
        |r| {
            Ok(BackupJobDto {
                id: r.get(0)?,
                destination_path: r.get(1)?,
                status: r.get(2)?,
                files_processed: r.get(3)?,
                files_failed: r.get(4)?,
                total_bytes: r.get(5)?,
                started_at: r.get(6)?,
                completed_at: r.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_backup_history(state: State<'_, AppState>) -> Result<Vec<BackupJobDto>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, destination_path, status, files_processed, files_failed, total_bytes, started_at, completed_at
             FROM backup_jobs ORDER BY started_at DESC LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(BackupJobDto {
                id: r.get(0)?,
                destination_path: r.get(1)?,
                status: r.get(2)?,
                files_processed: r.get(3)?,
                files_failed: r.get(4)?,
                total_bytes: r.get(5)?,
                started_at: r.get(6)?,
                completed_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

/// Verify backup integrity: every manifest file exists at the destination and hashes match.
#[tauri::command]
pub fn verify_backup(state: State<'_, AppState>, backup_path: String) -> Result<Vec<FailedFile>, String> {
    let _ = &state;
    let manifest_path = Path::new(&backup_path).join("manifest.json");
    let text = std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
    let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let files = manifest
        .get("files")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let base = PathBuf::from(&backup_path).join("photos");
    let mut problems = Vec::new();
    for f in files {
        let rel = f.get("file").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let hash = f.get("hash").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let target = base.join(&rel);
        if !target.exists() {
            problems.push(FailedFile { file: rel, error: "missing in backup".into() });
            continue;
        }
        match crate::util::sha256_file(&target) {
            Ok(h) if h == hash => {}
            _ => problems.push(FailedFile { file: rel, error: "hash mismatch".into() }),
        }
    }
    Ok(problems)
}

fn human(bytes: i64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut u = 0;
    while v >= 1024.0 && u < units.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    format!("{v:.1} {}", units[u])
}
