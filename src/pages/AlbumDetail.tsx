import { useEffect, useState } from "react";
import { ArrowLeft, FolderOutput, ImagePlus, Pencil, Star, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { useT } from "../i18n";
import { PhotoGrid } from "../components/PhotoGrid";
import { Lightbox } from "../components/Lightbox";
import { ExportDialog } from "../components/ExportDialog";
import { PhotoPicker } from "../components/PhotoPicker";
import { Button, Confirm, EmptyState, Field, Input, Modal, Spinner, Textarea, useToast } from "../components/ui";
import type { Album, AlbumPhoto, Photo } from "../types";

export function AlbumDetail({ albumId, thumbSize }: { albumId: number; thumbSize: number }) {
  const { navigate, tick } = useApp();
  const t = useT();
  const toast = useToast();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportZip, setExportZip] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    api.listAlbums().then((all) => {
      const a = all.find((x) => x.id === albumId);
      if (a) {
        setAlbum(a);
        setName(a.name);
        setDescription(a.description);
      } else {
        navigate("albums");
      }
    });
  }, [albumId, tick, navigate]);

  useEffect(() => {
    api.getAlbumPhotos(albumId).then(setPhotos).catch((e) => toast(String(e), "error"));
  }, [albumId, tick, toast]);

  const flatPhotos = photos?.map((ap) => ap.photo) ?? [];
  const selectedPhotos = flatPhotos.filter((p) => selected.has(p.id));

  const onSelect = (id: number, e: { meta: boolean; shift: boolean; index: number }) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.meta) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const addPhotos = async (picked: Photo[]) => {
    try {
      await api.addAlbumPhotos(albumId, picked.map((p) => p.id));
      if (!album?.coverPhotoId && picked[0]) await api.updateAlbum(albumId, { coverPhotoId: picked[0].id });
      toast(t("Added {count} photos", { count: String(picked.length) }), "success");
      setShowPicker(false);
      const list = await api.getAlbumPhotos(albumId);
      setPhotos(list);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const removeSelected = async () => {
    try {
      await api.removeAlbumPhotos(albumId, [...selected]);
      toast(t("Removed {count} photos from album", { count: String(selected.size) }), "success");
      setSelected(new Set());
      setPhotos(await api.getAlbumPhotos(albumId));
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const setCover = async () => {
    const first = [...selected][0];
    if (!first) return;
    try {
      await api.updateAlbum(albumId, { coverPhotoId: first });
      setAlbum({ ...(album as Album), coverPhotoId: first, coverThumb: selectedPhotos[0]?.thumbnailPath ?? null });
      toast(t("Cover updated"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const reorder = async (draggedIds: number[], targetId: number) => {
    if (!photos) return;
    const ids = photos.map((ap) => ap.photo.id).filter((id) => !draggedIds.includes(id));
    const targetIdx = ids.indexOf(targetId);
    ids.splice(targetIdx < 0 ? ids.length : targetIdx, 0, ...draggedIds);
    setPhotos(photos.map((ap, i) => ({ ...ap, photo: { ...ap.photo, id: ids[i] }, sortOrder: i })));
    try {
      await api.reorderAlbumPhotos(albumId, ids);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const saveEdit = async () => {
    try {
      await api.updateAlbum(albumId, { name: name.trim(), description: description.trim() });
      setAlbum({ ...(album as Album), name: name.trim(), description: description.trim() });
      setEditing(false);
      toast(t("Album updated"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const runExport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir !== "string") return;
      const res = await api.exportAlbum(albumId, dir, exportZip);
      toast(t("Exported {count} photos", { count: String(res.exported) }) + (res.failed ? `, ${t("{count} failed", { count: String(res.failed) })}` : ""), res.failed ? "error" : "success");
      setShowExport(false);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("albums")} title={t("Back to albums")}>
          <ArrowLeft size={17} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{album?.name ?? "…"}</h1>
          <p className="tnum truncate text-xs text-muted">
            {t("{count} photos", { count: photos?.length ?? 0 })}
            {album?.description ? ` · ${album.description}` : ""}
          </p>
        </div>
        <Button variant="default" size="sm" onClick={() => setShowPicker(true)}>
          <ImagePlus size={14} /> {t("Add photos")}
        </Button>
        <Button variant="default" size="sm" onClick={() => { setEditing(true); }}>
          <Pencil size={14} /> {t("Edit")}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowExport(true)}
        >
          <FolderOutput size={14} /> {t("Export")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {photos === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-muted" />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState
            icon={<ImagePlus size={40} strokeWidth={1.2} />}
            title={t("This album is empty")}
            description={t("Add photos from the library, or select photos in the Library page and use “Add to album”.")}
            action={
              <Button variant="primary" onClick={() => setShowPicker(true)}>
                <ImagePlus size={15} /> {t("Add photos")}
              </Button>
            }
          />
        ) : (
          <PhotoGrid
            photos={flatPhotos}
            selected={selected}
            onSelect={onSelect}
            onOpen={(p, i) => setLightbox(i)}
            thumbSize={thumbSize}
            draggable
            onReorderDrop={reorder}
          />
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-2.5">
          <span className="tnum text-sm font-medium">{t("{count} selected", { count: selected.size })}</span>
          <div className="mx-1 h-5 w-px bg-line" />
          <Button variant="ghost" size="sm" onClick={setCover}>
            <Star size={14} /> {t("Set as cover")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
            <Trash2 size={14} /> {t("Remove from album")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("Clear")}
          </Button>
        </div>
      )}

      {lightbox != null && photos && flatPhotos[lightbox] && (
        <Lightbox
          photos={flatPhotos}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onToggleFavorite={async (p) => {
            await api.updatePhoto(p.id, !p.isFavorite);
            setPhotos(await api.getAlbumPhotos(albumId));
          }}
          onNote={async (p, note) => {
            await api.updatePhoto(p.id, undefined, note);
          }}
        />
      )}

      <PhotoPicker open={showPicker} onClose={() => setShowPicker(false)} title={t("Add photos to {name}", { name: album?.name ?? "album" })} onConfirm={addPhotos} />

      <Modal open={showExport} onClose={() => setShowExport(false)} title={t("Export album")}>
        <div className="space-y-4 text-sm">
          <p className="text-muted">{t("Export all {count} photos in this album. Originals stay untouched.", { count: photos?.length ?? 0 })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={exportZip ? "default" : "primary"} onClick={() => setExportZip(false)}>
              {t("Folder")}
            </Button>
            <Button variant={exportZip ? "primary" : "default"} onClick={() => setExportZip(true)}>
              ZIP
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowExport(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={runExport}>
              {t("Choose destination")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title={t("Edit album")}>
        <div className="space-y-4">
          <Field label={t("Name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("Description")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={saveEdit}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={confirmRemove}
        title={t("Remove from album")}
        message={t("Remove {count} photos from this album? Files are kept in the library.", { count: String(selected.size) })}
        confirmLabel={t("Remove")}
        onConfirm={removeSelected}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
