<div align="center">

<img src="docs/assets/cover.png" alt="Xhalf Bridge" width="100%" />

# Xhalf Bridge

**Desktop photo management, film-style editing & wireless transfer for the Fujifilm X half**

[English](README.md) | [ไทย](README.th.md)

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-8a9a5b)
![Built with](https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React%20%2B%20Rust-24292f?logo=rust)
![License](https://img.shields.io/badge/license-MIT-a3b18a)
![AI](https://img.shields.io/badge/AI-none%20%F0%9F%9A%AB-a3b18a)

**[⬇️ Download the latest release](https://github.com/bvnkfatboy/xhalf-bridge/releases/latest)**

</div>

---

Xhalf Bridge brings everything a Fujifilm X half shooter needs into one offline desktop app: import photos from your camera's SD card or phone, organize them into albums and digital film rolls, edit them with film LUTs, grain and presets, build half-frame pairs and contact sheets, back everything up hash-verified — and receive photos from your phone over local Wi-Fi with no mobile app at all.

> **Local-first · Offline-first · No AI · No cloud · No account**

## ✨ Highlights

### 📷 Photo Library
- Import JPEG/PNG from folders, external drives or drag & drop; files are copied (originals never touched), verified with **SHA-256** and de-duplicated automatically
- Zoomable grid, full-screen lightbox, sort by capture/import date/name/size, date-range filter, search
- Full EXIF support: capture date, camera, aperture/shutter/ISO/focal length — with an honest *"import date"* fallback when EXIF is missing
- Favorites, per-photo notes, reveal in folder, export copies in any format

### 🎨 Film Editor
- **Light:** exposure, contrast, highlights, shadows, whites, blacks
- **Color:** temperature, tint, saturation, vibrance
- **Detail:** sharpen, clarity, **noise/grain reduction**
- **Film look:** **film grain** (amount + size), vignette, fade
- **40 built-in film LUTs** from the G'MIC collection — Portra, Ektar, Kodachrome, Velvia, Tri-X, Polaroid, Fuji X-Trans simulations, cinema print — plus **import your own `.cube` files**
- **22 film presets** ready to go, and save your own
- **Auto enhance**: deterministic histogram analysis (no AI) applies balanced corrections
- Non-destructive edits, before/after compare, pinch-to-zoom, full-resolution JPEG export

### 📁 Albums & 🎞 Film Rolls
- Logical grouping — files never move; delete an album and photos stay
- Drag to reorder, cover photos, export as folder or ZIP
- Digital film rolls with target frame counts (24/36/72), auto frame numbering and progress

### 📡 Wireless Transfer
1. Start the receiver → a local upload page opens on your Wi-Fi
2. Scan the QR code with your phone
3. Send photos saved from the Fujifilm X half app — they land in your library with hash checking and auto thumbnails

Token-authenticated, JPEG/PNG only, size & count limits, path-traversal safe, duplicate-checked, **never exposed to the public internet**.

### 📋 Contact Sheets & 🖼 Half-Frame Composer
- Contact sheets from any album or roll: columns, thumbnail size, frame numbers, dates, margins, colors — batched rendering for big libraries
- Composer with 7 layout presets, per-frame zoom/position, borders, divider, caption, undo/redo, saved projects, JPEG/PNG export up to 4000 px

### 💾 Backup
- Copy every photo (SHA-256 verified after copy) + database snapshot + manifest to any drive
- Free-space pre-check, one-click verify later, never deletes anything

### 🌐 English & ไทย
The whole interface ships in English and Thai — switch in **Settings → Language**.

## ⬇️ Download

Grab the latest installer from [**Releases**](https://github.com/bvnkfatboy/xhalf-bridge/releases/latest):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Xhalf_Bridge_aarch64.dmg` |
| Windows 10/11 (x64) | `Xhalf_Bridge_x64-setup.exe` / `.msi` |

> macOS builds are unsigned — right-click → **Open** on first launch.
> First run creates your library at `~/Pictures/Xhalf Bridge` (customizable in Settings).

## 🛠 Build from source

Requires Rust, [Bun](https://bun.sh) (or Node.js) and Xcode CLT / MSVC Build Tools.

```bash
bun install        # or: npm install
bun run tauri dev  # develop
bun run test       # unit tests (Vitest)
bun run tauri build
```

Releases for both platforms are built automatically by GitHub Actions when a `v*` tag is pushed (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Desktop | Tauri 2 |
| Frontend | React 18 + TypeScript + Tailwind CSS 4 |
| Backend | Rust (SQLite, axum, image, kamadak-exif, sha2) |
| Integrity | SHA-256 everywhere |
| Testing | Vitest + Rust unit tests |

```
xhalf-bridge/
├── src/            # React frontend (pages, components, i18n, WebGL editor engine)
├── src-tauri/      # Rust backend (db, importer, albums, transfer server, backup…)
├── public/luts/    # 40 bundled film LUTs (.cube)
├── docs/           # assets + cover generator
└── tests/          # Vitest unit tests
```

## 🔒 Privacy

Everything is processed locally. No account, no analytics, no API keys, no AI. Photos only ever leave your machine when you explicitly send them over **your own local network**.

## 🗺 Roadmap

RAW support · scheduled backups · auto-import folders · custom film border templates · direct camera pairing (needs protocol testing) · Windows ARM.

## 📄 License

[MIT](LICENSE) — bundled film LUTs are from the [G'MIC Film Luts collection](https://github.com/YahiaAngelo/Film-Luts) by YahiaAngelo (MIT).
