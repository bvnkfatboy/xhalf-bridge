import { FolderPlus, ImagePlus, Search, Wifi, X } from "lucide-react";
import { Button } from "./ui";
import { useT } from "../i18n";

interface TopbarProps {
  showSearch: boolean;
  search: string;
  onSearch: (v: string) => void;
  registerSearchRef: (el: HTMLInputElement | null) => void;
  task: { label: string; done: number; total: number } | null;
  onCancelTask: () => void;
  onImport: () => void;
  onImportFolder: () => void;
  onWireless: () => void;
  onNewAlbum: () => void;
  thumbSize: number;
  onThumbSize: (v: number) => void;
  showThumbSlider: boolean;
}

export function Topbar({
  showSearch,
  search,
  onSearch,
  registerSearchRef,
  task,
  onCancelTask,
  onImport,
  onImportFolder,
  onWireless,
  onNewAlbum,
  thumbSize,
  onThumbSize,
  showThumbSlider,
}: TopbarProps) {
  const t = useT();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      {showSearch && (
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={registerSearchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`${t("Search photos…")}  (⌘F)`}
            className="h-8 w-full rounded-lg border border-line bg-bg pl-8 pr-7 text-sm text-fg placeholder:text-muted/60 focus:border-accent/60 focus:outline-none"
          />
          {search && (
            <button onClick={() => onSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {showThumbSlider && (
        <div className="hidden items-center gap-2 md:flex" title={t("Thumbnail size")}>
          <input
            type="range"
            min={120}
            max={320}
            step={10}
            value={thumbSize}
            onChange={(e) => onThumbSize(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer appearance-none rounded bg-line accent-[var(--accent)]"
          />
        </div>
      )}

      <div className="flex-1" />

      {task && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5">
          <div className="min-w-32">
            <div className="text-xs font-medium text-fg">
              {t(task.label)}
              {task.total > 0 && <span className="tnum text-muted"> {task.done}/{task.total}</span>}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-line">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: task.total > 0 ? `${(task.done / task.total) * 100}%` : "30%" }}
              />
            </div>
          </div>
          <button onClick={onCancelTask} className="text-muted hover:text-danger" title={t("Cancel task")}>
            <X size={14} />
          </button>
        </div>
      )}

      <Button variant="default" onClick={onImportFolder} title={t("Import a folder of photos")}>
        <FolderPlus size={15} />
        <span className="hidden lg:inline">{t("Folder")}</span>
      </Button>
      <Button variant="primary" onClick={onImport} title={`${t("Import photos")} (⌘O)`}>
        <ImagePlus size={15} />
        {t("Import")}
      </Button>
      <Button variant="default" onClick={onWireless} title={t("Wireless transfer")}>
        <Wifi size={15} />
        <span className="hidden lg:inline">{t("Transfer")}</span>
      </Button>
      <Button variant="default" onClick={onNewAlbum} title={`${t("New album")} (⌘N)`}>
        <span className="text-base leading-none">+</span>
        <span className="hidden lg:inline">{t("Album")}</span>
      </Button>
    </header>
  );
}
