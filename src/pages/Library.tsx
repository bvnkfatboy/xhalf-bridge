import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderPlus, Heart, ImagePlus, Images, Trash2, FolderOutput, FolderMinus, Star, Wand2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { useT } from "../i18n";
import { PhotoGrid } from "../components/PhotoGrid";
import { Lightbox } from "../components/Lightbox";
import { ExportDialog } from "../components/ExportDialog";
import { Button, Confirm, EmptyState, Field, Input, Modal, Select, Spinner, useToast } from "../components/ui";
import { formatBytes, formatDate } from "../utils";
import type { Album, Photo, SortKey } from "../types";

export function Library({
  search,
  thumbSize,
  favoritesOnly = false,
}: {
  search: string;
  thumbSize: number;
  favoritesOnly?: boolean;
}) {
  const { tick, importDialog, importFolderDialog, navigate } = useApp();
  const t = useT();
  const toast = useToast();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [sort, setSort] = useState<SortKey>("captured");
  const [desc, setDesc] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [addToAlbum, setAddToAlbum] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmDeleteFiles, setConfirmDeleteFiles] = useState<null | { albums: number; rolls: number; composerProjects: number }>(null);

  useEffect(() => {
    const toMs = (d: string) => (d ? new Date(d + "T00:00:00").getTime() : undefined);
    api
      .listPhotos({
        query: search,
        sort,
        desc,
        favoritesOnly: favoritesOnly || favOnly,
        dateFrom: toMs(dateFrom),
        dateTo: dateTo ? toMs(dateTo)! + 86_399_000 : undefined,
      })
      .then(setPhotos)
      .catch((e) => toast(String(e), "error"));
  }, [tick, search, sort, desc, favOnly, favoritesOnly, dateFrom, dateTo, toast]);

  useEffect(() => {
    if (addToAlbum) api.listAlbums().then(setAlbums).catch(() => {});
  }, [addToAlbum]);

  useEffect(() => setSelected(new Set()), [search, sort, desc, favOnly, favoritesOnly]);

  const selectedPhotos = useMemo(() => photos?.filter((p) => selected.has(p.id)) ?? [], [photos, selected]);

  const onSelect = useCallback(
    (id: number, e: { meta: boolean; shift: boolean; index: number }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.shift && lastIndex != null) {
          const [a, b] = [lastIndex, e.index].sort((x, y) => x - y);
          if (!e.meta) next.clear();
          photos?.slice(a, b + 1).forEach((p) => next.add(p.id));
        } else if (e.meta) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          next.clear();
          next.add(id);
        }
        return next;
      });
      setLastIndex(e.index);
    },
    [photos, lastIndex],
  );

  const toggleFavorite = useCallback(async (p: Photo) => {
    const fav = !p.isFavorite;
    setPhotos((ps) => (ps ? ps.map((x) => (x.id === p.id ? { ...x, isFavorite: fav } : x)) : ps));
    await api.updatePhoto(p.id, fav).catch(() => {});
  }, []);

  const saveNote = useCallback(async (p: Photo, note: string) => {
    setPhotos((ps) => (ps ? ps.map((x) => (x.id === p.id ? { ...x, userNote: note } : x)) : ps));
    await api.updatePhoto(p.id, undefined, note).catch(() => {});
  }, []);

  // Keyboard: Space = preview, Esc = clear selection, Delete = remove from library
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") setSelected(new Set());
      if (e.key === " " && selected.size > 0) {
        e.preventDefault();
        const idx = photos?.findIndex((p) => selected.has(p.id));
        if (idx != null && idx >= 0) setLightbox(idx);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, photos]);

  // Cmd+E export shortcut
  useEffect(() => {
    const h = () => {
      if (selected.size > 0) setShowExport(true);
    };
    window.addEventListener("app:export", h);
    return () => window.removeEventListener("app:export", h);
  }, [selected]);

  const addToAlbumById = async (albumId: number) => {
    try {
      await api.addAlbumPhotos(albumId, [...selected]);
      const name = albums.find((a) => a.id === albumId)?.name ?? "album";
      toast(t("Added {count} photos to {album}", { count: String(selected.size), album: name }), "success");
      setAddToAlbum(false);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const removeSelected = async () => {
    try {
      await api.removePhotos([...selected], false);
      toast(t("Removed {count} photos from library", { count: String(selected.size) }), "success");
      setSelected(new Set());
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const deleteFilesSelected = async () => {
    try {
      await api.removePhotos([...selected], true);
      toast(t("Deleted {count} photo files", { count: String(selected.size) }), "success");
      setSelected(new Set());
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const askDeleteFiles = async () => {
    const usage = await api
      .getPhotoUsage([...selected])
      .catch(() => ({ albums: 0, rolls: 0, composerProjects: 0 }));
    setConfirmDeleteFiles(usage);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 w-44">
          <option value="captured">{t("Sort: Date taken")}</option>
          <option value="imported">{t("Sort: Date imported")}</option>
          <option value="name">{t("Sort: Filename")}</option>
          <option value="size">{t("Sort: File size")}</option>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setDesc(!desc)} title={t("Toggle sort direction")}>
          {desc ? "↓" : "↑"}
        </Button>
        {!favoritesOnly && (
          <Button
            variant={favOnly ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFavOnly(!favOnly)}
          >
            <Star size={13} /> {t("Favorites")}
          </Button>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>{t("From")}</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg" />
          <span>{t("To")}</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg" />
        </div>
        <div className="flex-1" />
        {photos && (
          <span className="tnum text-xs text-muted">
            {t("{count} photos", { count: photos.length })} · {formatBytes(photos.reduce((a, p) => a + p.fileSize, 0))}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {photos === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-muted" />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState
            icon={<Images size={44} strokeWidth={1.2} />}
            title={search || dateFrom || dateTo ? t("No matching photos") : favoritesOnly ? t("No favorites yet") : t("Your library is empty")}
            description={
              search || dateFrom || dateTo
                ? t("Try adjusting the search, filters or date range.")
                : t("Import photos from a folder or external drive, or receive them over Wi-Fi from your phone.")
            }
            action={
              !search && !favoritesOnly ? (
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" onClick={importDialog}>
                    <ImagePlus size={15} /> {t("Import photos")}
                  </Button>
                  <Button variant="default" onClick={importFolderDialog}>
                    <FolderPlus size={15} /> {t("Import folder")}
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <PhotoGrid
            photos={photos}
            selected={selected}
            onSelect={onSelect}
            onOpen={(p, i) => setLightbox(i)}
            thumbSize={thumbSize}
            draggable
          />
        )}
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-2.5">
          <span className="tnum text-sm font-medium text-fg">{t("{count} selected", { count: selected.size })}</span>
          <div className="mx-1 h-5 w-px bg-line" />
          <Button variant="ghost" size="sm" onClick={() => selectedPhotos.forEach((p) => toggleFavorite(p))}>
            <Heart size={14} /> {t("Favorite")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("editor", [...selected][0])}>
            <Wand2 size={14} /> {t("Edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAddToAlbum(true)}>
            <FolderPlus size={14} /> {t("Add to album")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowExport(true)}>
            <FolderOutput size={14} /> {t("Export")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
            <FolderMinus size={14} /> {t("Remove from library")}
          </Button>
          <Button variant="danger" size="sm" onClick={askDeleteFiles}>
            <Trash2 size={14} /> {t("Delete files")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("Clear")}
          </Button>
        </div>
      )}

      {lightbox != null && photos && photos[lightbox] && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onToggleFavorite={toggleFavorite}
          onNote={saveNote}
          onEdit={(p) => navigate("editor", p.id)}
        />
      )}

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} photos={selectedPhotos} />

      <Modal open={addToAlbum} onClose={() => setAddToAlbum(false)} title={t("Add {count} photos to album", { count: String(selected.size) })}>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {albums.length === 0 && <p className="text-sm text-muted">{t("No albums yet — create one first.")}</p>}
          {albums.map((a) => (
            <button
              key={a.id}
              onClick={() => addToAlbumById(a.id)}
              className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-accent/60 hover:bg-surface2"
            >
              <span>{a.name}</span>
              <span className="tnum text-xs text-muted">{a.photoCount}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Confirm
        open={confirmRemove}
        title={t("Remove from library")}
        message={t("Remove {count} photos from the library? The original files on disk are kept.", { count: String(selected.size) })}
        confirmLabel={t("Remove")}
        onConfirm={removeSelected}
        onCancel={() => setConfirmRemove(false)}
      />

      <Confirm
        open={confirmDeleteFiles != null}
        title={t("Delete photo files")}
        message={
          <>
            {t("Permanently delete {count} photo files from disk?", { count: String(selected.size) })}
            {confirmDeleteFiles && (confirmDeleteFiles.albums > 0 || confirmDeleteFiles.rolls > 0 || confirmDeleteFiles.composerProjects > 0) && (
              <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs">
                {t("These photos are used in {albums} album(s), {rolls} film roll(s) and {projects} composer project(s). They will be removed from those too.", {
                  albums: String(confirmDeleteFiles.albums),
                  rolls: String(confirmDeleteFiles.rolls),
                  projects: String(confirmDeleteFiles.composerProjects),
                })}
              </div>
            )}
            <div className="mt-2 text-xs">{t("This cannot be undone.")}</div>
          </>
        }
        confirmLabel={t("Delete permanently")}
        danger
        onConfirm={deleteFilesSelected}
        onCancel={() => setConfirmDeleteFiles(null)}
      />
    </div>
  );
}

export function AlbumPickerField({ albums, value, onChange }: { albums: Album[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Album">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose —</option>
        {albums.map((a) => (
          <option key={a.id} value={String(a.id)}>
            {a.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function DateRangeField(_props: { value: string; onChange: (v: string) => void }) {
  return <Input type="date" />;
}
