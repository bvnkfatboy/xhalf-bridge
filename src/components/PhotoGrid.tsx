import { memo, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../utils";
import type { Photo } from "../types";

export const DRAG_MIME = "application/x-xhalf-photos";

export function thumbUrl(p: Photo): string | null {
  return p.thumbnailPath ? convertFileSrc(p.thumbnailPath) : null;
}

export function fullUrl(p: Photo): string {
  return convertFileSrc(p.filePath);
}

interface Props {
  photos: Photo[];
  selected: Set<number>;
  onSelect: (id: number, e: { meta: boolean; shift: boolean; index: number }) => void;
  onOpen?: (photo: Photo, index: number) => void;
  thumbSize?: number;
  draggable?: boolean;
  overlayLabel?: (p: Photo) => string | null;
  onReorderDrop?: (draggedIds: number[], targetId: number) => void;
  className?: string;
}

export const PhotoGrid = memo(function PhotoGrid({
  photos,
  selected,
  onSelect,
  onOpen,
  thumbSize = 180,
  draggable = false,
  overlayLabel,
  onReorderDrop,
  className,
}: Props) {
  return (
    <div
      className={cn("grid gap-2 p-3", className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}
    >
      {photos.map((p, i) => (
        <PhotoCard
          key={p.id}
          photo={p}
          index={i}
          selected={selected.has(p.id)}
          onSelect={onSelect}
          onOpen={onOpen}
          draggable={draggable}
          overlayLabel={overlayLabel?.(p) ?? null}
          onReorderDrop={onReorderDrop}
        />
      ))}
    </div>
  );
});

function PhotoCard({
  photo,
  index,
  selected,
  onSelect,
  onOpen,
  draggable,
  overlayLabel,
  onReorderDrop,
}: {
  photo: Photo;
  index: number;
  selected: boolean;
  onSelect: Props["onSelect"];
  onOpen?: Props["onOpen"];
  draggable: boolean;
  overlayLabel: string | null;
  onReorderDrop?: Props["onReorderDrop"];
}) {
  const [loaded, setLoaded] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const url = thumbUrl(photo);
  return (
    <div
      className={cn(
        "content-virtual group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-surface transition-all",
        selected ? "border-accent ring-2 ring-accent/50" : "border-transparent hover:border-line",
        dropTarget && "border-accent ring-2 ring-accent/70",
      )}
      onClick={(e) => onSelect(photo.id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey, index })}
      onDoubleClick={() => onOpen?.(photo, index)}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify([photo.id]));
        e.dataTransfer.setData("text/plain", photo.originalFilename);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragOver={
        onReorderDrop
          ? (e) => {
              e.preventDefault();
              setDropTarget(true);
            }
          : undefined
      }
      onDragLeave={() => setDropTarget(false)}
      onDrop={
        onReorderDrop
          ? (e) => {
              e.preventDefault();
              setDropTarget(false);
              try {
                const ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as number[];
                if (Array.isArray(ids) && ids.length && !ids.includes(photo.id)) onReorderDrop(ids, photo.id);
              } catch {
                /* ignore foreign drops */
              }
            }
          : undefined
      }
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-muted/40">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
      {url && (
        <img
          src={url}
          alt={photo.originalFilename}
          loading="lazy"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn("h-full w-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {photo.isFavorite && (
        <div className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-danger backdrop-blur">
          <Heart size={11} fill="currentColor" />
        </div>
      )}
      {overlayLabel && (
        <div className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {overlayLabel}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-[10px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
        {photo.originalFilename}
      </div>
    </div>
  );
}
