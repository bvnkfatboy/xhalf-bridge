use crate::models::TransferInfo;
use crate::AppState;
use axum::{
    extract::{DefaultBodyLimit, Multipart, Query, State as AxumState},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rusqlite::params;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::watch;

const UPLOAD_PAGE: &str = include_str!("../upload_page.html");

pub struct TransferServer {
    pub port: u16,
    pub ip: String,
    pub token: String,
    pub expires_at: i64,
    pub job_id: i64,
    pub max_file_mb: u32,
    pub max_files: u32,
    pub received: Arc<AtomicU32>,
    pub failed: Arc<AtomicU32>,
    pub stop_tx: watch::Sender<bool>,
}

struct Shared {
    app: AppHandle,
    db: Arc<Mutex<rusqlite::Connection>>,
    token: String,
    expires_at: i64,
    max_file_bytes: u64,
    max_files: u32,
    dest_dir: PathBuf,
    thumbs_dir: PathBuf,
    received: Arc<AtomicU32>,
    failed: Arc<AtomicU32>,
    job_id: i64,
    temp_counter: AtomicU64,
}

fn token_valid(shared: &Shared, t: Option<&String>) -> bool {
    match t {
        Some(t) => t == &shared.token && crate::util::now_ms() < shared.expires_at,
        None => false,
    }
}

async fn index_handler(AxumState(_shared): AxumState<Arc<Shared>>) -> Html<&'static str> {
    Html(UPLOAD_PAGE)
}

async fn info_handler(
    AxumState(shared): AxumState<Arc<Shared>>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !token_valid(&shared, params.get("t")) {
        return (StatusCode::UNAUTHORIZED, Json(json!({"ok": false, "error": "invalid or expired token"}))).into_response();
    }
    Json(json!({
        "ok": true,
        "app": "Xhalf Bridge",
        "maxFileMb": shared.max_file_bytes / 1024 / 1024,
        "maxFiles": shared.max_files,
        "expiresAt": shared.expires_at,
    }))
    .into_response()
}

async fn upload_handler(
    AxumState(shared): AxumState<Arc<Shared>>,
    Query(params): Query<HashMap<String, String>>,
    mut multipart: Multipart,
) -> Response {
    if !token_valid(&shared, params.get("t")) {
        return (StatusCode::UNAUTHORIZED, Json(json!({"ok": false, "error": "invalid or expired token"}))).into_response();
    }
    if shared.received.load(Ordering::SeqCst) >= shared.max_files {
        return (StatusCode::FORBIDDEN, Json(json!({"ok": false, "error": "file limit reached for this session"}))).into_response();
    }

    let mut field = match multipart.next_field().await {
        Ok(Some(f)) => f,
        Ok(None) => return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "no file provided"}))).into_response(),
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": format!("bad request: {e}")}))).into_response(),
    };

    let raw_name = field.file_name().unwrap_or("photo.jpg").to_string();
    let name = crate::util::sanitize_filename(&raw_name);
    let ext_ok = matches!(
        name.rsplit('.').next().map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("jpg") | Some("jpeg") | Some("png")
    );
    if !ext_ok {
        return (StatusCode::UNSUPPORTED_MEDIA_TYPE, Json(json!({"ok": false, "error": "only JPEG and PNG files are allowed"}))).into_response();
    }

    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    let mut written: u64 = 0;
    let mut too_large = false;
    let temp_path = shared.dest_dir.join(format!(".upload-{}-{}.part", crate::util::now_ms(), shared.temp_counter.fetch_add(1, Ordering::SeqCst)));
    {
        let mut out = match std::fs::File::create(&temp_path) {
            Ok(f) => f,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": format!("storage: {e}")}))).into_response(),
        };
        while let Some(chunk) = match field.chunk().await {
            Ok(Some(c)) => Some(c),
            Ok(None) => None,
            Err(_) => None,
        } {
            hasher.update(&chunk);
            written += chunk.len() as u64;
            if written > shared.max_file_bytes {
                too_large = true;
                break;
            }
            use std::io::Write;
            if out.write_all(&chunk).is_err() {
                let _ = std::fs::remove_file(&temp_path);
                shared.failed.fetch_add(1, Ordering::SeqCst);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": "failed to write file"}))).into_response();
            }
        }
    }

    let hash = format!("{:x}", hasher.finalize());
    let fail = |shared: &Shared, msg: &str, status: StatusCode| -> Response {
        let _ = std::fs::remove_file(&temp_path);
        shared.failed.fetch_add(1, Ordering::SeqCst);
        update_job(&shared);
        let _ = shared.app.emit("transfer://received", json!({"name": name, "status": "failed", "error": msg, "received": shared.received.load(Ordering::SeqCst)}));
        (status, Json(json!({"ok": false, "error": msg}))).into_response()
    };

    if too_large {
        return fail(&shared, &format!("file exceeds {} MB limit", shared.max_file_bytes / 1024 / 1024), StatusCode::PAYLOAD_TOO_LARGE);
    }
    if written == 0 {
        return fail(&shared, "empty file", StatusCode::BAD_REQUEST);
    }

    // Duplicate detection by hash
    {
        let conn = shared.db.lock().unwrap();
        let dup = conn
            .query_row("SELECT 1 FROM photos WHERE file_hash = ?1 LIMIT 1", [&hash], |_| Ok(()))
            .is_ok();
        if dup {
            let _ = std::fs::remove_file(&temp_path);
            let _ = shared.app.emit("transfer://received", json!({"name": name, "status": "duplicate", "received": shared.received.load(Ordering::SeqCst)}));
            update_job(&shared);
            return Json(json!({"ok": true, "saved": false, "status": "duplicate", "error": "file already exists in library"})).into_response();
        }
    }

    // Move into the library, generate thumbnail, insert DB row
    let dest = crate::util::unique_dest_path(&shared.dest_dir, &name);
    if let Err(e) = std::fs::rename(&temp_path, &dest) {
        return fail(&shared, &format!("save: {e}"), StatusCode::INTERNAL_SERVER_ERROR);
    }
    let photo_id = {
        let conn = shared.db.lock().unwrap();
        match crate::importer::import_received_file(&conn, &dest, &shared.thumbs_dir, &hash) {
            Ok(id) => id,
            Err(e) => return fail(&shared, &e, StatusCode::INTERNAL_SERVER_ERROR),
        }
    };

    shared.received.fetch_add(1, Ordering::SeqCst);
    update_job(&shared);
    let _ = shared.app.emit(
        "transfer://received",
        json!({"name": name, "status": "saved", "photoId": photo_id, "received": shared.received.load(Ordering::SeqCst)}),
    );
    Json(json!({"ok": true, "saved": true, "status": "saved", "name": name})).into_response()
}

fn update_job(shared: &Shared) {
    let conn = shared.db.lock().unwrap();
    conn.execute(
        "UPDATE transfer_jobs SET total_files = ?1, completed_files = ?2, failed_files = ?3 WHERE id = ?4",
        params![
            shared.received.load(Ordering::SeqCst) + shared.failed.load(Ordering::SeqCst),
            shared.received.load(Ordering::SeqCst),
            shared.failed.load(Ordering::SeqCst),
            shared.job_id
        ],
    )
    .ok();
}

#[tauri::command]
pub async fn start_transfer_server(
    app: AppHandle,
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<TransferInfo, String> {
    {
        let guard = state.transfer.lock().unwrap();
        if let Some(s) = guard.as_ref() {
            return Ok(info_from(&app, s));
        }
    }

    // Sync setup (db + settings + job row), done before any await
    let (db, job_id, token, expires_at, max_file_mb, max_files, dest_dir, thumbs_dir) = {
        let conn = state.db.lock().unwrap();
        let max_file_mb = crate::settings::get_i64(&conn, "transfer_max_file_mb", 100) as u32;
        let max_files = crate::settings::get_i64(&conn, "transfer_max_files", 500) as u32;
        let ttl = crate::settings::get_i64(&conn, "transfer_token_ttl_min", 15);
        let dest_dir = crate::settings::originals_dir(&conn);
        std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        let thumbs_dir = PathBuf::from(crate::settings::get_or(&conn, "library_root", "")).join("Thumbnails");
        std::fs::create_dir_all(&thumbs_dir).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO transfer_jobs (source_device, destination_path, status, started_at) VALUES ('mobile', ?1, 'running', ?2)",
            params![dest_dir.to_string_lossy(), crate::util::now_ms()],
        )
        .map_err(|e| e.to_string())?;
        let job_id = conn.last_insert_rowid();
        let mut token_bytes = [0u8; 8];
        use rand::Rng;
        rand::thread_rng().fill(&mut token_bytes);
        let token: String = token_bytes.iter().map(|b| format!("{b:02x}")).collect();
        (
            state.db.clone(),
            job_id,
            token,
            crate::util::now_ms() + ttl * 60_000,
            max_file_mb,
            max_files,
            dest_dir,
            thumbs_dir,
        )
    };

    let db_for_state = db.clone();
    let received = Arc::new(AtomicU32::new(0));
    let failed = Arc::new(AtomicU32::new(0));
    let shared = Arc::new(Shared {
        app: app.clone(),
        db,
        token: token.clone(),
        expires_at,
        max_file_bytes: (max_file_mb as u64) * 1024 * 1024,
        max_files,
        dest_dir,
        thumbs_dir,
        received: received.clone(),
        failed: failed.clone(),
        job_id,
        temp_counter: AtomicU64::new(0),
    });

    let router = Router::new()
        .route("/", get(index_handler))
        .route("/api/info", get(info_handler))
        .route("/api/upload", post(upload_handler))
        .layer(DefaultBodyLimit::max((max_file_mb as usize) * 1024 * 1024 + 1024 * 1024))
        .with_state(shared);

    let bind_port = port.unwrap_or_else(|| {
        let conn = db_for_state.lock().unwrap();
        crate::settings::get_i64(&conn, "transfer_port", 8737) as u16
    });

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", bind_port)).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(("0.0.0.0", 0))
            .await
            .map_err(|e| format!("bind: {e}"))?,
    };
    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (stop_tx, mut stop_rx) = watch::channel(false);
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = stop_rx.changed().await;
            })
            .await;
    });

    let ip = crate::util::local_ip();
    let server = TransferServer {
        port: actual_port,
        ip: ip.clone(),
        token: token.clone(),
        expires_at,
        job_id,
        max_file_mb,
        max_files,
        received,
        failed,
        stop_tx,
    };
    let info = info_from(&app, &server);
    {
        let mut guard = state.transfer.lock().unwrap();
        *guard = Some(server);
    }
    let _ = app.emit("transfer://state", json!({"running": true}));
    Ok(info)
}

fn info_from(_app: &AppHandle, s: &TransferServer) -> TransferInfo {
    TransferInfo {
        running: true,
        port: s.port,
        ip: s.ip.clone(),
        url: format!("http://{}:{}/?t={}", s.ip, s.port, s.token),
        token: s.token.clone(),
        expires_at: s.expires_at,
        received_count: s.received.load(Ordering::SeqCst),
        failed_count: s.failed.load(Ordering::SeqCst),
        max_file_mb: s.max_file_mb,
        max_files: s.max_files,
    }
}

#[tauri::command]
pub fn stop_transfer_server(state: State<'_, AppState>) -> Result<(), String> {
    stop_server_impl(&state);
    Ok(())
}

pub fn stop_server_impl(state: &State<'_, AppState>) {
    let mut guard = state.transfer.lock().unwrap();
    if let Some(server) = guard.take() {
        let _ = server.stop_tx.send(true);
        let conn = state.db.lock().unwrap();
        conn.execute(
            "UPDATE transfer_jobs SET status = 'completed', completed_at = ?1 WHERE id = ?2",
            params![crate::util::now_ms(), server.job_id],
        )
        .ok();
    }
}

#[tauri::command]
pub fn get_transfer_state(state: State<'_, AppState>) -> TransferInfo {
    let guard = state.transfer.lock().unwrap();
    match guard.as_ref() {
        Some(s) => TransferInfo {
            running: crate::util::now_ms() < s.expires_at,
            port: s.port,
            ip: s.ip.clone(),
            url: format!("http://{}:{}/?t={}", s.ip, s.port, s.token),
            token: s.token.clone(),
            expires_at: s.expires_at,
            received_count: s.received.load(Ordering::SeqCst),
            failed_count: s.failed.load(Ordering::SeqCst),
            max_file_mb: s.max_file_mb,
            max_files: s.max_files,
        },
        None => TransferInfo {
            running: false,
            port: 0,
            ip: String::new(),
            url: String::new(),
            token: String::new(),
            expires_at: 0,
            received_count: 0,
            failed_count: 0,
            max_file_mb: 0,
            max_files: 0,
        },
    }
}

#[tauri::command]
pub fn list_transfer_jobs(state: State<'_, AppState>) -> Result<Vec<crate::models::TransferJobDto>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, source_device, destination_path, total_files, completed_files, failed_files, status, started_at, completed_at
             FROM transfer_jobs ORDER BY started_at DESC LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(crate::models::TransferJobDto {
                id: r.get(0)?,
                source_device: r.get(1)?,
                destination_path: r.get(2)?,
                total_files: r.get(3)?,
                completed_files: r.get(4)?,
                failed_files: r.get(5)?,
                status: r.get(6)?,
                started_at: r.get(7)?,
                completed_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}
