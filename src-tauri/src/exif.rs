use serde_json::{json, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

/// Extract capture date (epoch ms), camera model and exposure info from EXIF, when available.
pub fn read_exif(path: &Path) -> (Option<i64>, Option<String>, Value) {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return (None, None, json!({})),
    };
    let mut reader = BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return (None, None, json!({})),
    };

    let camera_model = exif
        .get_field(exif::Tag::Model, exif::In::PRIMARY)
        .and_then(ascii_string)
        .filter(|s| !s.is_empty());

    let date_str = exif
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY))
        .and_then(ascii_string);

    let captured_at = date_str.as_deref().and_then(parse_exif_datetime);

    let mut exposure = json!({});
    if let Some(f) = exif.get_field(exif::Tag::FNumber, exif::In::PRIMARY) {
        if let exif::Value::Rational(r) = &f.value {
            if let Some(first) = r.first() {
                exposure["fNumber"] = json!(format!("f/{}", first.to_f64()));
            }
        }
    }
    if let Some(f) = exif.get_field(exif::Tag::ExposureTime, exif::In::PRIMARY) {
        if let exif::Value::Rational(r) = &f.value {
            if let Some(first) = r.first() {
                let v = first.to_f64();
                let label = if v >= 1.0 {
                    format!("{v:.1}s")
                } else {
                    format!("1/{}s", (1.0 / v).round() as u64)
                };
                exposure["exposureTime"] = json!(label);
            }
        }
    }
    if let Some(f) = exif.get_field(exif::Tag::PhotographicSensitivity, exif::In::PRIMARY) {
        if let exif::Value::Short(s) = &f.value {
            if let Some(first) = s.first() {
                exposure["iso"] = json!(first);
            }
        }
    }
    if let Some(f) = exif.get_field(exif::Tag::FocalLength, exif::In::PRIMARY) {
        if let exif::Value::Rational(r) = &f.value {
            if let Some(first) = r.first() {
                exposure["focalLength"] = json!(format!("{:.1}mm", first.to_f64()));
            }
        }
    }

    (captured_at, camera_model, json!({ "exposure": exposure }))
}

fn ascii_string(field: &exif::Field) -> Option<String> {
    match &field.value {
        exif::Value::Ascii(parts) => parts.first().map(|b| {
            String::from_utf8_lossy(b)
                .trim_end_matches('\0')
                .trim()
                .to_string()
        }),
        _ => None,
    }
}

fn parse_exif_datetime(s: &str) -> Option<i64> {
    let naive = chrono::NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S").ok()?;
    use chrono::TimeZone;
    chrono::Local
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.timestamp_millis())
}
