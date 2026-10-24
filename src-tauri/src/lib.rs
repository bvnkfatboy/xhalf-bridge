mod albums;
mod backup;
mod composer;
mod db;
mod editor;
mod exporter;
mod exif;
mod importer;
mod models;
mod photos;
mod rolls;
mod settings;
mod thumbs;
mod transfer;
mod util;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub db_path: PathBuf,
    pub transfer: Mutex<Option<transfer::TransferServer>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("cannot resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("cannot create app data dir");
            let db_path = data_dir.join("xhalf.db");
            let conn = Connection::open(&db_path).expect("cannot open database");
            db::init(&conn).expect("cannot run database migrations");

            let default_library = app
                .path()
                .picture_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("Xhalf Bridge");
            settings::init_defaults(&conn, default_library).expect("cannot init settings");
            settings::ensure_library_dirs(&conn).expect("cannot create library dirs");

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                db_path,
                transfer: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // settings & info
            settings::get_settings,
            settings::set_setting,
            photos::get_storage_info,
            // photos
            photos::list_photos,
            photos::get_photo,
            photos::update_photo,
            photos::get_photo_usage,
            photos::remove_photos,
            photos::cancel_import,
            importer::import_photos,
            // albums
            albums::create_album,
            albums::list_albums,
            albums::update_album,
            albums::delete_album,
            albums::get_album_photos,
            albums::add_album_photos,
            albums::remove_album_photos,
            albums::reorder_album_photos,
            albums::export_album,
            // film rolls
            rolls::create_film_roll,
            rolls::list_film_rolls,
            rolls::update_film_roll,
            rolls::delete_film_roll,
            rolls::get_film_roll_photos,
            rolls::add_film_roll_photos,
            rolls::remove_film_roll_photos,
            rolls::reorder_film_roll_photos,
            // composer
            composer::save_composer_project,
            composer::list_composer_projects,
            composer::get_composer_project,
            composer::delete_composer_project,
            composer::save_canvas_export,
            // export
            exporter::export_photos,
            exporter::cancel_export,
            // backup
            backup::run_backup,
            backup::get_backup_history,
            backup::verify_backup,
            // transfer
            transfer::start_transfer_server,
            transfer::stop_transfer_server,
            transfer::get_transfer_state,
            transfer::list_transfer_jobs,
            // editor
            editor::get_photo_edit,
            editor::save_photo_edit,
            editor::clear_photo_edit,
            editor::list_editor_presets,
            editor::save_editor_preset,
            editor::delete_editor_preset,
            editor::import_lut,
            editor::list_custom_luts,
            editor::delete_lut,
            editor::read_custom_lut,
            editor::add_rendered_photo,
        ])
        .build(tauri::generate_context!())
        .expect("error while building xhalf bridge")
        .run(|app_handle, event| match event {
            tauri::RunEvent::Exit => {
                let state: tauri::State<AppState> = app_handle.state();
                transfer::stop_server_impl(&state);
            }
            _ => {}
        });
}
