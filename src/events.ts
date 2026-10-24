import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface TaskProgress {
  done: number;
  total: number;
  current: string;
}

export interface TransferReceived {
  name: string;
  status: "saved" | "duplicate" | "failed";
  error?: string;
  photoId?: number;
  received: number;
}

export const events = {
  onImportProgress: (cb: (p: TaskProgress) => void): Promise<UnlistenFn> =>
    listen<TaskProgress>("import://progress", (e) => cb(e.payload)),
  onExportProgress: (cb: (p: TaskProgress) => void): Promise<UnlistenFn> =>
    listen<TaskProgress>("export://progress", (e) => cb(e.payload)),
  onBackupProgress: (cb: (p: TaskProgress) => void): Promise<UnlistenFn> =>
    listen<TaskProgress>("backup://progress", (e) => cb(e.payload)),
  onLibraryChanged: (cb: () => void): Promise<UnlistenFn> =>
    listen("library://changed", () => cb()),
  onTransferReceived: (cb: (p: TransferReceived) => void): Promise<UnlistenFn> =>
    listen<TransferReceived>("transfer://received", (e) => cb(e.payload)),
  onTransferState: (cb: () => void): Promise<UnlistenFn> =>
    listen("transfer://state", () => cb()),
  onFileDrop: (cb: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<{ paths: string[] }>("tauri://drag-drop", (e) => cb(e.payload.paths ?? [])),
};
