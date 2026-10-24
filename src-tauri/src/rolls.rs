use crate::models::{photo_from_row, FilmRollDto, RollPhotoDto};
use crate::AppState;
use rusqlite::{params, Connection};
use tauri::State;

fn row_to_roll(row: &rusqlite::Row) -> rusqlite::Result<FilmRollDto> {
    Ok(FilmRollDto {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        target_frames: row.get("target_frames")?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        cover_photo_id: row.get("cover_photo_id")?,
        cover_thumb: row.get("cover_thumb")?,
        photo_count: row.get("photo_count")?,
        created_at: row.get("created_at")?,
    })
}

const ROLL_SELECT: &str = "SELECT fr.*,
    (SELECT COUNT(*) FROM film_roll_photos frp WHERE frp.film_roll_id = fr.id) AS photo_count,
    (SELECT p.thumbnail_path FROM photos p WHERE p.id = fr.cover_photo_id) AS cover_thumb
    FROM film_rolls fr";

pub fn get_roll_row(conn: &Connection, id: i64) -> Result<FilmRollDto, String> {
    conn.query_row(&format!("{ROLL_SELECT} WHERE fr.id = ?1"), [id], row_to_roll)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_film_roll(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    target_frames: Option<i64>,
) -> Result<FilmRollDto, String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO film_rolls (name, description, target_frames, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![name.trim(), description.unwrap_or_default(), target_frames.unwrap_or(36), crate::util::now_ms()],
    )
    .map_err(|e| e.to_string())?;
    get_roll_row(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_film_rolls(state: State<'_, AppState>) -> Result<Vec<FilmRollDto>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(&format!("{ROLL_SELECT} ORDER BY fr.created_at DESC")).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_roll).map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn update_film_roll(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    target_frames: Option<i64>,
    start_date: Option<Option<i64>>,
    end_date: Option<Option<i64>>,
    cover_photo_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    if let Some(n) = name {
        conn.execute("UPDATE film_rolls SET name = ?1 WHERE id = ?2", params![n.trim(), id]).map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute("UPDATE film_rolls SET description = ?1 WHERE id = ?2", params![d, id]).map_err(|e| e.to_string())?;
    }
    if let Some(t) = target_frames {
        conn.execute("UPDATE film_rolls SET target_frames = ?1 WHERE id = ?2", params![t.max(1), id]).map_err(|e| e.to_string())?;
    }
    if let Some(sd) = start_date {
        conn.execute("UPDATE film_rolls SET start_date = ?1 WHERE id = ?2", params![sd, id]).map_err(|e| e.to_string())?;
    }
    if let Some(ed) = end_date {
        conn.execute("UPDATE film_rolls SET end_date = ?1 WHERE id = ?2", params![ed, id]).map_err(|e| e.to_string())?;
    }
    if let Some(c) = cover_photo_id {
        conn.execute("UPDATE film_rolls SET cover_photo_id = ?1 WHERE id = ?2", params![c, id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_film_roll(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM film_rolls WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_film_roll_photos(state: State<'_, AppState>, roll_id: i64) -> Result<Vec<RollPhotoDto>, String> {
    let conn = state.db.lock().unwrap();
    get_film_roll_photos_impl(&conn, roll_id)
}

pub fn get_film_roll_photos_impl(conn: &Connection, roll_id: i64) -> Result<Vec<RollPhotoDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.*, frp.frame_number AS frame_num, frp.sort_order AS fr_sort
             FROM film_roll_photos frp JOIN photos p ON p.id = frp.photo_id
             WHERE frp.film_roll_id = ?1 ORDER BY frp.sort_order, frp.frame_number",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([roll_id], |r| {
            Ok(RollPhotoDto { photo: photo_from_row(r)?, frame_number: r.get("frame_num")?, sort_order: r.get("fr_sort")? })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn add_film_roll_photos(state: State<'_, AppState>, roll_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let next_frame: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(frame_number), 0) + 1 FROM film_roll_photos WHERE film_roll_id = ?1",
            [roll_id],
            |r| r.get(0),
        )
        .unwrap_or(1);
    let next_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM film_roll_photos WHERE film_roll_id = ?1",
            [roll_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    for (i, pid) in photo_ids.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO film_roll_photos (film_roll_id, photo_id, frame_number, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params![roll_id, pid, next_frame + i as i64, next_sort + i as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_film_roll_photos(state: State<'_, AppState>, roll_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    for pid in photo_ids {
        conn.execute(
            "DELETE FROM film_roll_photos WHERE film_roll_id = ?1 AND photo_id = ?2",
            params![roll_id, pid],
        )
        .map_err(|e| e.to_string())?;
    }
    renumber_roll(&conn, roll_id)
}

#[tauri::command]
pub fn reorder_film_roll_photos(state: State<'_, AppState>, roll_id: i64, photo_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    for (i, pid) in photo_ids.iter().enumerate() {
        conn.execute(
            "UPDATE film_roll_photos SET sort_order = ?1 WHERE film_roll_id = ?2 AND photo_id = ?3",
            params![i as i64, roll_id, pid],
        )
        .map_err(|e| e.to_string())?;
    }
    renumber_roll(&conn, roll_id)
}

fn renumber_roll(conn: &Connection, roll_id: i64) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT photo_id FROM film_roll_photos WHERE film_roll_id = ?1 ORDER BY sort_order, frame_number")
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt.query_map([roll_id], |r| r.get(0)).map_err(|e| e.to_string())?.flatten().collect();
    for (i, pid) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE film_roll_photos SET frame_number = ?1 WHERE film_roll_id = ?2 AND photo_id = ?3",
            params![(i + 1) as i64, roll_id, pid],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
