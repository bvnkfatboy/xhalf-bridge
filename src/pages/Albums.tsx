import { useEffect, useState } from "react";
import { FolderOpen, Images, Pencil, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { DRAG_MIME } from "../components/PhotoGrid";
import { Button, Confirm, EmptyState, Field, Input, Modal, Textarea, useToast } from "../components/ui";
import { useT } from "../i18n";
import { formatDate } from "../utils";
import type { Album } from "../types";

export function Albums() {
  const { tick, navigate } = useApp();
  const t = useT();
  const toast = useToast();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Album | null>(null);
  const [deleting, setDeleting] = useState<Album | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const h = () => setShowCreate(true);
    window.addEventListener("app:new-album", h);
    return () => window.removeEventListener("app:new-album", h);
  }, []);

  useEffect(() => {
    api.listAlbums().then(setAlbums).catch((e) => toast(String(e), "error"));
  }, [tick, toast]);

  const reset = () => {
    setShowCreate(false);
    setEditing(null);
    setName("");
    setDescription("");
  };

  const save = async () => {
    if (!name.trim()) return;
    try {
      if (editing) {
        await api.updateAlbum(editing.id, { name: name.trim(), description: description.trim() });
        toast(t("Album updated"), "success");
      } else {
        const a = await api.createAlbum(name.trim(), description.trim());
        toast(t("Album {name} created", { name: a.name }), "success");
      }
      reset();
      api.listAlbums().then(setAlbums);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteAlbum(deleting.id);
      toast(t("Album {name} deleted (photos kept)", { name: deleting.name }), "success");
      setDeleting(null);
      api.listAlbums().then(setAlbums);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    let ids: number[] = [];
    try {
      ids = JSON.parse(raw);
    } catch {
      return;
    }
    if (!ids.length) return;
    try {
      const album = await api.createAlbum(t("New Album"));
      await api.addAlbumPhotos(album.id, ids);
      navigate("album", album.id);
    } catch (err) {
      toast(String(err), "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t("Albums")}</h1>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <span className="text-base leading-none">+</span> {t("New album")}
          </Button>
        </div>

        {albums === null ? null : albums.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <EmptyState
              icon={<FolderOpen size={44} strokeWidth={1.2} />}
              title={t("No albums yet")}
              description={t("Create an album to group photos — Bangkok Cafe, Weekend Walk, Travel 2026… Albums are logical groups; your original files stay where they are. You can also drag photos here from the Library.")}
              action={
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                  {t("Create your first album")}
                </Button>
              }
            />
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 ${dragOver ? "rounded-xl ring-2 ring-accent/60" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {albums.map((a) => (
              <div
                key={a.id}
                className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-accent/50"
              >
                <button className="block w-full text-left" onClick={() => navigate("album", a.id)}>
                  <div className="aspect-[4/3] w-full bg-surface2">
                    {a.coverThumb ? (
                      <img src={a.coverThumb} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted/50">
                        <Images size={28} strokeWidth={1.2} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className="tnum mt-0.5 text-xs text-muted">
                      {t("{count} photos", { count: a.photoCount })} · {formatDate(a.updatedAt)}
                    </div>
                  </div>
                </button>
                <div className="flex justify-end border-t border-line px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setName(a.name); setDescription(a.description); }} title={t("Edit")}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleting(a)} title={t("Delete album")}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate || editing != null} onClose={reset} title={editing ? t("Edit album") : t("New album")}>
        <div className="space-y-4">
          <Field label={t("Name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Bangkok Cafe")} autoFocus />
          </Field>
          <Field label={t("Description (optional)")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("What is this album about?")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>
              {editing ? t("Save changes") : t("Create album")}
            </Button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={deleting != null}
        title={t("Delete album")}
        message={t("Delete album {name}? Photos are NOT deleted — only the album grouping is removed.", { name: deleting?.name ?? "" })}
        confirmLabel={t("Delete album")}
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
