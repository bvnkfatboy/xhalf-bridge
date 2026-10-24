use image::metadata::Orientation;
use image::{DynamicImage, GenericImageView, ImageReader};
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

/// Create a max-`max_dim` JPEG thumbnail next to `thumb_dir` keyed by file hash.
/// Returns the absolute thumbnail path.
pub fn make_thumbnail(src: &Path, thumb_dir: &Path, hash: &str, max_dim: u32, orientation: Option<u16>) -> Result<String, String> {
    std::fs::create_dir_all(thumb_dir).map_err(|e| e.to_string())?;
    let img = ImageReader::open(src).map_err(|e| format!("open: {e}"))?.decode().map_err(|e| format!("decode: {e}"))?;

    let img = apply_orientation(img, orientation);
    let thumb = img.thumbnail(max_dim, max_dim);
    let flat = flatten_on_white(thumb);

    let dest = thumb_dir.join(format!("{hash}.jpg"));
    let file = File::create(&dest).map_err(|e| e.to_string())?;
    let writer = BufWriter::new(file);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 85);
    flat.write_with_encoder(encoder).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

pub fn read_orientation(src: &Path) -> Option<u16> {
    let file = File::open(src).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;
    let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    match &field.value {
        exif::Value::Short(v) => v.first().copied(),
        _ => None,
    }
}

fn apply_orientation(img: DynamicImage, orientation: Option<u16>) -> DynamicImage {
    let mut img = img;
    if let Some(o) = orientation.and_then(orientation_from_exif) {
        img.apply_orientation(o);
    }
    img
}

fn orientation_from_exif(v: u16) -> Option<Orientation> {
    Some(match v {
        1 => Orientation::NoTransforms,
        2 => Orientation::FlipHorizontal,
        3 => Orientation::Rotate180,
        4 => Orientation::FlipVertical,
        5 => Orientation::Rotate90FlipH,
        6 => Orientation::Rotate90,
        7 => Orientation::Rotate270FlipH,
        8 => Orientation::Rotate270,
        _ => return None,
    })
}

fn flatten_on_white(img: DynamicImage) -> DynamicImage {
    let (w, h) = img.dimensions();
    let has_alpha = img.color().has_alpha();
    if !has_alpha {
        return img;
    }
    let mut white = image::RgbaImage::from_pixel(w, h, image::Rgba([255, 255, 255, 255]));
    image::imageops::overlay(&mut white, &img.to_rgba8(), 0, 0);
    DynamicImage::ImageRgba8(white)
}

/// Re-encode a photo into jpeg/png with a given quality (used by export manager).
pub fn encode_file(src: &Path, dest: &Path, format: &str, quality: u8) -> Result<(), String> {
    let img = ImageReader::open(src).map_err(|e| format!("open: {e}"))?.decode().map_err(|e| format!("decode: {e}"))?;
    let file = File::create(dest).map_err(|e| e.to_string())?;
    let writer = BufWriter::new(file);
    match format {
        "png" => {
            img.write_with_encoder(image::codecs::png::PngEncoder::new(writer)).map_err(|e| e.to_string())
        }
        _ => {
            let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, quality.clamp(1, 100));
            img.write_with_encoder(enc).map_err(|e| e.to_string())
        }
    }
}
