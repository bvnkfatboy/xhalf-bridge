use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoDto {
    pub id: i64,
    pub file_path: String,
    pub original_filename: String,
    pub file_hash: String,
    pub file_size: i64,
    pub mime_type: String,
    pub width: i64,
    pub height: i64,
    pub captured_at: Option<i64>,
    pub date_source: String,
    pub imported_at: i64,
    pub camera_model: Option<String>,
    pub metadata: Value,
    pub is_favorite: bool,
    pub user_note: String,
    pub thumbnail_path: String,
    pub source: String,
}

pub fn photo_from_row(row: &rusqlite::Row) -> rusqlite::Result<PhotoDto> {
    let metadata_json: String = row.get("metadata_json")?;
    let metadata: Value = serde_json::from_str(&metadata_json).unwrap_or(Value::Null);
    Ok(PhotoDto {
        id: row.get("id")?,
        file_path: row.get("file_path")?,
        original_filename: row.get("original_filename")?,
        file_hash: row.get("file_hash")?,
        file_size: row.get("file_size")?,
        mime_type: row.get("mime_type")?,
        width: row.get("width")?,
        height: row.get("height")?,
        captured_at: row.get("captured_at")?,
        date_source: row.get("date_source")?,
        imported_at: row.get("imported_at")?,
        camera_model: row.get("camera_model")?,
        metadata,
        is_favorite: row.get::<_, i64>("is_favorite")? != 0,
        user_note: row.get("user_note")?,
        thumbnail_path: row.get("thumbnail_path")?,
        source: row.get("source")?,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDto {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub cover_photo_id: Option<i64>,
    pub cover_thumb: Option<String>,
    pub photo_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmRollDto {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub target_frames: i64,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub cover_photo_id: Option<i64>,
    pub cover_thumb: Option<String>,
    pub photo_count: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollPhotoDto {
    pub photo: PhotoDto,
    pub frame_number: i64,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPhotoDto {
    pub photo: PhotoDto,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerProjectDto {
    pub id: i64,
    pub name: String,
    pub project: Value,
    pub canvas_width: i64,
    pub canvas_height: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferJobDto {
    pub id: i64,
    pub source_device: String,
    pub destination_path: String,
    pub total_files: i64,
    pub completed_files: i64,
    pub failed_files: i64,
    pub status: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupJobDto {
    pub id: i64,
    pub destination_path: String,
    pub status: String,
    pub files_processed: i64,
    pub files_failed: i64,
    pub total_bytes: i64,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FailedFile {
    pub file: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported: u32,
    pub duplicates: u32,
    pub failed: u32,
    pub total: u32,
    pub duplicate_files: Vec<String>,
    pub failed_files: Vec<FailedFile>,
    pub photo_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub exported: u32,
    pub failed: u32,
    pub cancelled: bool,
    pub failed_files: Vec<FailedFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub albums: i64,
    pub rolls: i64,
    pub composer_projects: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub originals_bytes: i64,
    pub thumbnails_bytes: i64,
    pub database_bytes: i64,
    pub free_bytes: Option<i64>,
    pub library_root: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInfo {
    pub running: bool,
    pub port: u16,
    pub ip: String,
    pub url: String,
    pub token: String,
    pub expires_at: i64,
    pub received_count: u32,
    pub failed_count: u32,
    pub max_file_mb: u32,
    pub max_files: u32,
}
