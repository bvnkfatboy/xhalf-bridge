import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Grid3x3 } from "lucide-react";
import { api } from "../api";
import { Button, Field, Input, Select, Spinner, useToast } from "../components/ui";
import { defaultSheetOptions, renderContactSheet, sheetDimensions, type SheetOptions } from "../lib/contactsheet";
import { useT } from "../i18n";
import { cn } from "../utils";
import type { Album, FilmRoll, Photo } from "../types";

export function ContactSheets({ sourceId }: { sourceId: number | null }) {
  const t = useT();
  const toast = useToast();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [rolls, setRolls] = useState<FilmRoll[]>([]);
  const [sourceType, setSourceType] = useState<"album" | "roll" | null>(null);
  const [sourceKey, setSourceKey] = useState<string>("");
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [frameMap, setFrameMap] = useState<Map<number, number>>(new Map());
  const [opts, setOpts] = useState<SheetOptions>(defaultSheetOptions);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    Promise.all([api.listAlbums(), api.listFilmRolls()])
      .then(([a, r]) => {
        setAlbums(a);
        setRolls(r);
      })
      .catch((e) => toast(String(e), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preselect a film roll when navigated from a roll
  useEffect(() => {
    if (sourceId != null) {
      setSourceType("roll");
      setSourceKey(String(sourceId));
    }
  }, [sourceId]);

  // Load photos for the chosen source
  useEffect(() => {
    if (!sourceType || !sourceKey) {
      setPhotos(null);
      return;
    }
    const [type, idStr] = [sourceType, Number(sourceKey)];
    (async () => {
      try {
        if (type === "album") {
          const list = await api.getAlbumPhotos(idStr);
          setPhotos(list.map((ap) => ap.photo));
          setFrameMap(new Map());
        } else {
          const list = await api.getFilmRollPhotos(idStr);
          setPhotos(list.map((rp) => rp.photo));
          setFrameMap(new Map(list.map((rp) => [rp.photo.id, rp.frameNumber])));
        }
      } catch (e) {
        toast(String(e), "error");
      }
    })();
  }, [sourceType, sourceKey, toast]);

  const dims = useMemo(() => (photos ? sheetDimensions(photos, opts) : null), [photos, opts]);

  // Render preview (thumbnails, fit-to-width via CSS)
  useEffect(() => {
    if (!photos || !previewRef.current) return;
    let cancelled = false;
    setLoading(true);
    setProgress({ done: 0, total: photos.length });
    renderContactSheet(previewRef.current, photos, opts, { frameNumber: (p) => frameMap.get(p.id) ?? null }, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    })
      .catch((e) => !cancelled && toast(String(e), "error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [photos, opts, frameMap, toast]);

  const doExport = async (format: "jpeg" | "png") => {
    if (!photos?.length) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: `contact-sheet-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`,
        filters: [{ name: format.toUpperCase(), extensions: [format === "jpeg" ? "jpg" : "png"] }],
      });
      if (!dest) return;
      setLoading(true);
      const off = document.createElement("canvas");
      await renderContactSheet(off, photos, opts, { frameNumber: (p) => frameMap.get(p.id) ?? null });
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      await api.saveCanvasExport(off.toDataURL(mime, 0.92), dest);
      toast(t("Contact sheet exported"), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const set = <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => setOpts((o) => ({ ...o, [key]: value }));

  return (
    <div className="flex h-full">
      {/* Options */}
      <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-r border-line bg-surface p-4">
        <Field label={t("Source")}>
          <Select
            value={sourceKey ? `${sourceType}:${sourceKey}` : ""}
            onChange={(e) => {
              const [type, id] = e.target.value.split(":");
              setSourceType(type as "album" | "roll");
              setSourceKey(id);
            }}
          >
            <option value="">— {t("choose album or roll")} —</option>
            {albums.length > 0 && (
              <optgroup label={t("Albums")}>
                {albums.map((a) => (
                  <option key={`a${a.id}`} value={`album:${a.id}`}>
                    {a.name} ({a.photoCount})
                  </option>
                ))}
              </optgroup>
            )}
            {rolls.length > 0 && (
              <optgroup label={t("Film rolls")}>
                {rolls.map((r) => (
                  <option key={`r${r.id}`} value={`roll:${r.id}`}>
                    {r.name} ({r.photoCount})
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        <Field label={`${t("Columns")} — ${opts.columns}`}>
          <input type="range" min={2} max={10} value={opts.columns} onChange={(e) => set("columns", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label={`${t("Thumbnail size")} — ${opts.cellSize}px`}>
          <input type="range" min={120} max={480} step={20} value={opts.cellSize} onChange={(e) => set("cellSize", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label={`${t("Margin")} — ${opts.margin}px`}>
          <input type="range" min={0} max={120} step={4} value={opts.margin} onChange={(e) => set("margin", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label={`${t("Gap")} — ${opts.gap}px`}>
          <input type="range" min={0} max={60} step={2} value={opts.gap} onChange={(e) => set("gap", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Background")}>
            <input type="color" value={opts.bg} onChange={(e) => set("bg", e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-surface" />
          </Field>
          <Field label={t("Text")}>
            <input type="color" value={opts.textColor} onChange={(e) => set("textColor", e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-surface" />
          </Field>
          <Field label={t("Border color")}>
            <input type="color" value={opts.borderColor} onChange={(e) => set("borderColor", e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-surface" />
          </Field>
          <Field label={`${t("Border")} ${opts.borderWidth}px`}>
            <input type="range" min={0} max={12} value={opts.borderWidth} onChange={(e) => set("borderWidth", Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
          </Field>
        </div>

        <div className="space-y-2">
          {(
            [
              ["showFilename", t("Show filename")],
              ["showFrameNumbers", t("Show frame numbers")],
              ["showDate", t("Show capture date")],
            ] as [keyof SheetOptions, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={Boolean(opts[key])} onChange={(e) => set(key, e.target.checked as never)} className="accent-[var(--accent)]" />
              {label}
            </label>
          ))}
        </div>

        <Field label={t("Title (optional)")}>
          <Input value={opts.title} onChange={(e) => set("title", e.target.value)} placeholder={t("Roll name / album name")} />
        </Field>

        {dims && (
          <p className="tnum text-[11px] text-muted">
            {t("Export size")}: {dims.width} × {dims.height} px
          </p>
        )}

        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="primary" className="flex-1" disabled={!photos?.length || loading} onClick={() => doExport("jpeg")}>
            <Download size={14} /> JPEG
          </Button>
          <Button variant="default" className="flex-1" disabled={!photos?.length || loading} onClick={() => doExport("png")}>
            <Download size={14} /> PNG
          </Button>
        </div>
      </aside>

      {/* Preview */}
      <div ref={wrapRef} className="min-w-0 flex-1 overflow-auto bg-bg p-4">
        {!photos ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <Grid3x3 size={44} strokeWidth={1.2} />
            <p className="text-sm">{t("Choose an album or film roll to build a contact sheet.")}</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t("This source has no photos.")}</div>
        ) : (
          <div className="relative mx-auto" style={{ maxWidth: dims?.width ?? 800 }}>
            <canvas
              ref={previewRef}
              className={cn("w-full rounded-lg border border-line shadow-2xl", loading && "opacity-70")}
            />
            {loading && progress.total > 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-xs text-white">
                  <Spinner /> {t("Rendering")} {progress.done}/{progress.total}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
