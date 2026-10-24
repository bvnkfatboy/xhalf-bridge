import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { ToastContext, ToastList, type ToastMsg } from "./components/ui";
import { api } from "./api";
import { events } from "./events";
import { Dashboard } from "./pages/Dashboard";
import { Library } from "./pages/Library";
import { Albums } from "./pages/Albums";
import { AlbumDetail } from "./pages/AlbumDetail";
import { FilmRolls } from "./pages/FilmRolls";
import { RollDetail } from "./pages/RollDetail";
import { Transfer } from "./pages/Transfer";
import { Composer } from "./pages/Composer";
import { ContactSheets } from "./pages/ContactSheets";
import { Editor } from "./pages/Editor";
import { Backup } from "./pages/Backup";
import { Settings } from "./pages/Settings";
import { LangProvider, useT, type Lang } from "./i18n";

export type ViewKey =
  | "dashboard"
  | "library"
  | "albums"
  | "album"
  | "rolls"
  | "roll"
  | "transfer"
  | "composer"
  | "editor"
  | "sheets"
  | "favorites"
  | "backup"
  | "settings";

export interface AppContextValue {
  navigate: (view: ViewKey, param?: number | null) => void;
  tick: number;
  settings: Record<string, string>;
  refreshSettings: () => Promise<void>;
  importPaths: (paths: string[], source?: string) => void;
  importDialog: () => void;
  importFolderDialog: () => void;
  newAlbum: () => void;
}

export const AppContext = createContext<AppContextValue>(null as unknown as AppContextValue);
export const useApp = () => useContext(AppContext);

export default function App() {
  const t = useT();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [viewParam, setViewParam] = useState<number | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [tick, setTick] = useState(0);
  const [task, setTask] = useState<{ label: string; done: number; total: number } | null>(null);
  const [search, setSearch] = useState("");
  const [thumbSize, setThumbSize] = useState(() => Number(localStorage.getItem("xhalf.thumbSize")) || 180);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const registerSearchRef = useCallback((el: HTMLInputElement | null) => {
    searchRef.current = el;
  }, []);
  const taskLabel = useRef("Working");

  const toast = useCallback((msg: string, type: ToastMsg["type"] = "info") => {
    setToasts((ts) => [...ts.slice(-4), { id: Date.now() + Math.random(), msg, type }]);
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      document.documentElement.dataset.theme = s.theme === "light" ? "light" : "dark";
    } catch (e) {
      console.error("settings", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("xhalf.thumbSize", String(thumbSize));
  }, [thumbSize]);

  const importPaths = useCallback(
    (paths: string[], source = "import") => {
      if (!paths.length) return;
      taskLabel.current = "Importing";
      setTask({ label: "Importing", done: 0, total: 0 });
      api
        .importPhotos(paths, source)
        .then((s) => {
          if (s.imported) toast(t("Imported {count} photos", { count: s.imported }), "success");
          if (s.duplicates) toast(t("{count} duplicates skipped", { count: s.duplicates }));
          if (s.failed) toast(t("{count} files failed to import", { count: s.failed }), "error");
          setTick((x) => x + 1);
        })
        .catch((e) => toast(String(e), "error"))
        .finally(() => setTask(null));
    },
    [toast],
  );

  const importDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({
        multiple: true,
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }],
      });
      if (Array.isArray(sel)) importPaths(sel as string[]);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [importPaths, toast]);

  const importFolderDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") importPaths([dir]);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [importPaths, toast]);

  const newAlbum = useCallback(() => {
    setView("albums");
    setViewParam(null);
    // Delay so the Albums page can mount and attach its listener first
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("app:new-album")), 60);
  }, []);

  const navigate = useCallback((v: ViewKey, param: number | null = null) => {
    setView(v);
    setViewParam(param);
  }, []);

  useEffect(() => {
    refreshSettings();
    const unsubs = [
      events.onImportProgress((p) => setTask({ label: "Importing", done: p.done, total: p.total })),
      events.onExportProgress((p) => {
        taskLabel.current = "Exporting";
        setTask({ label: "Exporting", done: p.done, total: p.total });
      }),
      events.onBackupProgress((p) => {
        taskLabel.current = "Backing up";
        setTask({ label: "Backing up", done: p.done, total: p.total });
      }),
      events.onLibraryChanged(() => setTick((t) => t + 1)),
      events.onFileDrop((paths) => {
        if (paths?.length) importPaths(paths, "drop");
      }),
    ];
    return () => unsubs.forEach((u) => u.then((f) => f()));
  }, [refreshSettings, importPaths]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        importDialog();
      } else if (key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === "n") {
        e.preventDefault();
        newAlbum();
      } else if (key === "e") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("app:export"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [importDialog, newAlbum]);

  const cancelTask = useCallback(() => {
    if (task?.label === "Importing") api.cancelImport().catch(() => {});
    else api.cancelExport().catch(() => {});
  }, [task]);

  const showSearch = view === "library" || view === "favorites";
  const showThumbSlider = view === "library" || view === "favorites" || view === "album" || view === "roll";
  const lang = (settings.language === "th" ? "th" : "en") as Lang;

  return (
    <LangProvider lang={lang}>
      <ToastContext.Provider value={toast}>
        <AppContext.Provider
          value={{ navigate, tick, settings, refreshSettings, importPaths, importDialog, importFolderDialog, newAlbum }}
        >
          <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
            <Sidebar view={view} onNavigate={navigate} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                showSearch={showSearch}
                search={search}
                onSearch={setSearch}
                registerSearchRef={registerSearchRef}
                task={task}
                onCancelTask={cancelTask}
                onImport={importDialog}
                onImportFolder={importFolderDialog}
                onWireless={() => navigate("transfer")}
                onNewAlbum={newAlbum}
                thumbSize={thumbSize}
                onThumbSize={setThumbSize}
                showThumbSlider={showThumbSlider}
              />
              <main className="min-h-0 flex-1 overflow-hidden">
                {view === "dashboard" && <Dashboard />}
                {view === "library" && <Library search={search} thumbSize={thumbSize} />}
                {view === "favorites" && <Library search={search} thumbSize={thumbSize} favoritesOnly />}
                {view === "albums" && <Albums />}
                {view === "album" && viewParam != null && <AlbumDetail albumId={viewParam} thumbSize={thumbSize} />}
                {view === "rolls" && <FilmRolls />}
                {view === "roll" && viewParam != null && <RollDetail rollId={viewParam} thumbSize={thumbSize} />}
                {view === "transfer" && <Transfer />}
                {view === "composer" && <Composer />}
                {view === "editor" && <Editor photoId={viewParam} />}
                {view === "sheets" && <ContactSheets sourceId={viewParam} />}
                {view === "backup" && <Backup />}
                {view === "settings" && <Settings />}
              </main>
            </div>
          </div>
          <ToastList toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
        </AppContext.Provider>
      </ToastContext.Provider>
    </LangProvider>
  );
}
