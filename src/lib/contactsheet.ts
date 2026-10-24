import type { Photo } from "../types";

export interface SheetOptions {
  columns: number;
  cellSize: number; // px per cell at render scale
  margin: number;
  gap: number;
  bg: string;
  textColor: string;
  borderWidth: number;
  borderColor: string;
  showFilename: boolean;
  showFrameNumbers: boolean;
  showDate: boolean;
  title: string;
}

export function defaultSheetOptions(): SheetOptions {
  return {
    columns: 5,
    cellSize: 240,
    margin: 40,
    gap: 16,
    bg: "#141414",
    textColor: "#b9b7b0",
    borderWidth: 2,
    borderColor: "#3a3d35",
    showFilename: true,
    showFrameNumbers: false,
    showDate: false,
    title: "",
  };
}

export interface SheetMeta {
  frameNumber?: (p: Photo) => number | null;
}

const imgCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (imgCache.size > 160) imgCache.clear();
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = src;
  });
}

function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * Compute sheet canvas dimensions for a photo list (without drawing).
 */
export function sheetDimensions(photos: Photo[], o: SheetOptions): { width: number; height: number } {
  const labelH = o.showFilename || o.showFrameNumbers || o.showDate ? Math.round(o.cellSize * 0.16) : 0;
  const titleH = o.title.trim() ? Math.round(o.cellSize * 0.3) : 0;
  const cols = Math.max(1, o.columns);
  const rows = Math.ceil(photos.length / cols) || 1;
  const cellW = o.cellSize + o.borderWidth * 2;
  const width = o.margin * 2 + cols * cellW + (cols - 1) * o.gap;
  const height = o.margin + titleH + rows * (cellW + labelH + o.gap) + o.margin;
  return { width, height };
}

/**
 * Render a contact sheet. Loads thumbnails in batches to keep memory bounded.
 */
export async function renderContactSheet(
  canvas: HTMLCanvasElement,
  photos: Photo[],
  o: SheetOptions,
  meta: SheetMeta = {},
  onProgress?: (done: number, total: number) => void,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = sheetDimensions(photos, o);
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, width, height);

  const cols = Math.max(1, o.columns);
  const cellW = o.cellSize + o.borderWidth * 2;
  const labelH = o.showFilename || o.showFrameNumbers || o.showDate ? Math.round(o.cellSize * 0.16) : 0;
  const titleH = o.title.trim() ? Math.round(o.cellSize * 0.3) : 0;

  if (o.title.trim()) {
    ctx.fillStyle = o.textColor;
    ctx.font = `600 ${Math.round(o.cellSize * 0.14)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(o.title.trim(), o.margin, o.margin + titleH * 0.6);
  }

  const labelFont = Math.max(10, Math.round(o.cellSize * 0.075));
  ctx.font = `400 ${labelFont}px ui-monospace, "SF Mono", Menlo, monospace`;

  // Load thumbnails in batches of 24 to bound memory on big libraries
  const batchSize = 24;
  const thumbs: (HTMLImageElement | null)[] = new Array(photos.length).fill(null);
  for (let start = 0; start < photos.length; start += batchSize) {
    const batch = photos.slice(start, start + batchSize).map((p, i) =>
      loadImage(p.thumbnailPath || p.filePath)
        .then((img) => {
          thumbs[start + i] = img;
        })
        .catch(() => {}),
    );
    await Promise.all(batch);
    onProgress?.(Math.min(photos.length, start + batchSize), photos.length);
  }

  for (let i = 0; i < photos.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = o.margin + col * (cellW + o.gap);
    const y = o.margin + titleH + row * (cellW + labelH + o.gap);
    const p = photos[i];

    if (o.borderWidth > 0) {
      ctx.fillStyle = o.borderColor;
      ctx.fillRect(x, y, cellW, cellW);
    }
    const ix = x + o.borderWidth;
    const iw = o.cellSize;
    const img = thumbs[i];
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, y + o.borderWidth, iw, iw);
      ctx.clip();
      coverDraw(ctx, img, ix, y + o.borderWidth, iw, iw);
      ctx.restore();
    } else {
      ctx.fillStyle = o.bg === "#141414" ? "#222527" : "#d8d6cf";
      ctx.fillRect(ix, y + o.borderWidth, iw, iw);
    }

    if (labelH > 0) {
      const ly = y + cellW + labelFont + 4;
      const parts: string[] = [];
      if (o.showFrameNumbers) {
        const f = meta.frameNumber?.(p) ?? null;
        parts.push(f != null ? `#${f}` : `#${i + 1}`);
      }
      if (o.showDate) {
        const d = p.capturedAt ?? p.importedAt;
        parts.push(new Date(d).toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }));
      }
      if (o.showFilename) parts.push(p.originalFilename);
      const label = parts.join("  ·  ");
      ctx.fillStyle = o.textColor;
      ctx.textAlign = "left";
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, ly - labelFont, cellW, labelH);
      ctx.clip();
      ctx.fillText(label, x, ly, cellW);
      ctx.restore();
    }
  }
}
