import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Info, Pencil, X } from "lucide-react";
import { cn, dimensionLabel, formatBytes, formatDateTime } from "../utils";
import { fullUrl } from "./PhotoGrid";
import { useT } from "../i18n";
import type { Photo } from "../types";

interface Props {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onToggleFavorite: (p: Photo) => void;
  onNote: (p: Photo, note: string) => void;
  onEdit?: (p: Photo) => void;
}

interface ExifInfo {
  fNumber?: string;
  exposureTime?: string;
  iso?: number;
  focalLength?: string;
}

export function Lightbox({ photos, index, onIndex, onClose, onToggleFavorite, onNote, onEdit }: Props) {
  const t = useT();
  const [showInfo, setShowInfo] = useState(true);
  const photo = photos[index];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
      else if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (e.key === "i") setShowInfo((v) => !v);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;
  const exposure = (photo.metadata?.exposure ?? {}) as ExifInfo;

  return (
    <div className="fixed inset-0 z-40 flex bg-black/90">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              <X size={18} />
            </button>
            <span className="tnum text-sm text-white/70">
              {index + 1} / {photos.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(photo)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                title={t("Edit")}
              >
                <Pencil size={17} />
              </button>
            )}
            <button
              onClick={() => onToggleFavorite(photo)}
              className={cn("rounded-lg p-1.5 hover:bg-white/10", photo.isFavorite ? "text-danger" : "text-white/80")}
              title={t("Favorite")}
            >
              <Heart size={18} fill={photo.isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              onClick={() => setShowInfo((v) => !v)}
              className={cn("rounded-lg p-1.5 hover:bg-white/10", showInfo ? "text-accent" : "text-white/80")}
              title="Info (i)"
            >
              <Info size={18} />
            </button>
          </div>
        </div>

        <button
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/80 hover:bg-black/70 disabled:opacity-0"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          onClick={() => onIndex(Math.min(photos.length - 1, index + 1))}
          disabled={index === photos.length - 1}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/80 hover:bg-black/70 disabled:opacity-0"
        >
          <ChevronRight size={22} />
        </button>

        <div className="flex min-h-0 flex-1 items-center justify-center p-14">
          <img
            src={fullUrl(photo)}
            alt={photo.originalFilename}
            className="max-h-full max-w-full select-none rounded object-contain shadow-2xl"
            draggable={false}
          />
        </div>
      </div>

      {showInfo && (
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-5">
          <h3 className="mb-1 break-all text-sm font-semibold text-fg">{photo.originalFilename}</h3>
          <p className="mb-4 font-mono text-[11px] text-muted">SHA-256 {photo.fileHash.slice(0, 16)}…</p>

          <InfoRow label={photo.dateSource === "exif" ? t("Capture date") : t("Import date")} value={formatDateTime(photo.capturedAt ?? photo.importedAt)} />
          <InfoRow label={t("Date source")} value={photo.dateSource === "exif" ? t("Capture date (EXIF)") : t("Import date (no EXIF)")} />
          <InfoRow label={t("Imported")} value={formatDateTime(photo.importedAt)} />
          <InfoRow label={t("Dimensions")} value={dimensionLabel(photo)} />
          <InfoRow label={t("File size")} value={formatBytes(photo.fileSize)} />
          <InfoRow label={t("Format")} value={photo.mimeType} />
          <InfoRow label={t("Camera")} value={photo.cameraModel ?? "—"} />
          {exposure.fNumber && <InfoRow label={t("Aperture")} value={exposure.fNumber} />}
          {exposure.exposureTime && <InfoRow label={t("Shutter")} value={exposure.exposureTime} />}
          {exposure.iso && <InfoRow label="ISO" value={String(exposure.iso)} />}
          {exposure.focalLength && <InfoRow label={t("Focal length")} value={exposure.focalLength} />}

          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{t("Note")}</span>
            <textarea
              defaultValue={photo.userNote}
              placeholder={t("Add a note…")}
              onBlur={(e) => onNote(photo, e.target.value)}
              className="min-h-20 w-full resize-y rounded-lg border border-line bg-bg p-2.5 text-sm text-fg focus:border-accent/60 focus:outline-none"
            />
          </div>
        </aside>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="truncate text-right text-fg" title={value}>
        {value}
      </span>
    </div>
  );
}
