import { useEffect, useState } from "react";
import { Film, FolderOpen, Heart, HardDriveDownload, Images, Wifi } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { thumbUrl } from "../components/PhotoGrid";
import { Button, EmptyState } from "../components/ui";
import { useT } from "../i18n";
import { formatBytes, formatDateTime, timeAgo } from "../utils";
import type { Album, BackupJob, FilmRoll, Photo, StorageInfo, TransferJob } from "../types";

export function Dashboard() {
  const { tick, navigate, importDialog } = useApp();
  const t = useT();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [rolls, setRolls] = useState<FilmRoll[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [lastBackup, setLastBackup] = useState<BackupJob | null>(null);
  const [transfers, setTransfers] = useState<TransferJob[]>([]);

  useEffect(() => {
    api.listPhotos({ sort: "imported", desc: true }).then(setPhotos).catch(() => {});
    api.listAlbums().then(setAlbums).catch(() => {});
    api.listFilmRolls().then(setRolls).catch(() => {});
    api.getStorageInfo().then(setStorage).catch(() => {});
    api.getBackupHistory().then((h) => setLastBackup(h[0] ?? null)).catch(() => {});
    api.listTransferJobs().then(setTransfers).catch(() => {});
  }, [tick]);

  const favorites = photos.filter((p) => p.isFavorite).slice(0, 12);
  const recent = photos.slice(0, 18);

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<Images size={48} strokeWidth={1.1} />}
        title={t("Welcome to Xhalf Bridge")}
        description={t("Bring in photos from your Fujifilm X half, organize them into albums and film rolls, create half-frame pairs and contact sheets — all offline, on your machine.")}
        action={
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={importDialog}>
              <Images size={15} /> {t("Import your first photos")}
            </Button>
            <Button variant="default" onClick={() => navigate("transfer")}>
              <Wifi size={15} /> {t("Set up wireless transfer")}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Images size={18} />} label={t("Photos")} value={photos.length.toLocaleString()} onClick={() => navigate("library")} />
          <StatCard icon={<FolderOpen size={18} />} label={t("Albums")} value={albums.length.toLocaleString()} onClick={() => navigate("albums")} />
          <StatCard icon={<Film size={18} />} label={t("Film rolls")} value={rolls.length.toLocaleString()} onClick={() => navigate("rolls")} />
          <StatCard icon={<Heart size={18} />} label={t("Favorites")} value={favorites.length.toLocaleString()} onClick={() => navigate("favorites")} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("Quick actions")}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <QuickAction icon={<Images size={17} />} label={t("Import photos")} onClick={importDialog} />
            <QuickAction icon={<FolderOpen size={17} />} label={t("New album")} onClick={() => navigate("albums")} />
            <QuickAction icon={<Wifi size={17} />} label={t("Wireless transfer")} onClick={() => navigate("transfer")} />
            <QuickAction icon={<Film size={17} />} label={t("New film roll")} onClick={() => navigate("rolls")} />
          </div>
        </section>

        <PhotoStrip title={t("Recently imported")} photos={recent} emptyText={t("No photos yet")} onSeeAll={() => navigate("library")} />

        {favorites.length > 0 && (
          <PhotoStrip title={t("Favorites")} photos={favorites} emptyText="" onSeeAll={() => navigate("favorites")} />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-5">
            <SectionHeader icon={<Wifi size={15} />} title={t("Wireless transfer")} onSeeAll={() => navigate("transfer")} />
            {transfers.length === 0 ? (
              <p className="text-sm text-muted">{t("No transfers yet. Start the receiver and send photos from your phone.")}</p>
            ) : (
              <ul className="space-y-2">
                {transfers.slice(0, 4).map((tr) => (
                  <li key={tr.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{formatDateTime(tr.startedAt)}</span>
                    <span className={tr.status === "completed" ? "text-accent" : tr.status === "failed" ? "text-danger" : "text-fg"}>
                      {t("{count} received", { count: tr.completedFiles })}
                      {tr.failedFiles ? `, ${t("{count} failed", { count: tr.failedFiles })}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            <SectionHeader icon={<HardDriveDownload size={15} />} title={t("Backup & storage")} onSeeAll={() => navigate("backup")} />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{t("Last backup")}</span>
                <span className={lastBackup?.status === "completed" ? "text-accent" : "text-fg"}>
                  {lastBackup ? `${timeAgo(lastBackup.completedAt ?? lastBackup.startedAt)} (${lastBackup.status})` : t("never")}
                </span>
              </div>
              {storage && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted">{t("Photos on disk")}</span>
                    <span className="tnum">{formatBytes(storage.originalsBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t("Thumbnails")}</span>
                    <span className="tnum">{formatBytes(storage.thumbnailsBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t("Database")}</span>
                    <span className="tnum">{formatBytes(storage.databaseBytes)}</span>
                  </div>
                  {storage.freeBytes != null && (
                    <div className="flex justify-between">
                      <span className="text-muted">{t("Free space")}</span>
                      <span className="tnum">{formatBytes(storage.freeBytes)}</span>
                    </div>
                  )}
                  <div className="truncate pt-1 text-xs text-muted" title={storage.libraryRoot}>
                    {t("Library")}: {storage.libraryRoot}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-accent/50"
    >
      <div className="rounded-lg bg-accent/15 p-2.5 text-accent">{icon}</div>
      <div>
        <div className="tnum text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted">{label}</div>
      </div>
    </button>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium transition-colors hover:border-accent/50 hover:bg-surface2"
    >
      <span className="text-accent">{icon}</span>
      {label}
    </button>
  );
}

function SectionHeader({ icon, title, onSeeAll }: { icon: React.ReactNode; title: string; onSeeAll: () => void }) {
  const t = useT();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="text-accent">{icon}</span> {title}
      </h2>
      <button onClick={onSeeAll} className="text-xs text-muted hover:text-accent">
        {t("See all →")}
      </button>
    </div>
  );
}

function PhotoStrip({
  title,
  photos,
  emptyText,
  onSeeAll,
}: {
  title: string;
  photos: Photo[];
  emptyText: string;
  onSeeAll: () => void;
}) {
  const t = useT();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <button onClick={onSeeAll} className="text-xs text-muted hover:text-accent">
          {t("See all →")}
        </button>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => {
            const url = thumbUrl(p);
            return (
              <button
                key={p.id}
                onClick={onSeeAll}
                className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-surface2"
                title={p.originalFilename}
              >
                {url ? (
                  <img src={url} alt={p.originalFilename} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Images size={16} className="m-auto text-muted" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
