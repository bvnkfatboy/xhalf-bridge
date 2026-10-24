import { invoke } from "@tauri-apps/api/core";
import type {
  Album,
  AlbumPhoto,
  BackupJob,
  ComposerProject,
  EditorPreset,
  ExportResult,
  FilmRoll,
  ImportSummary,
  ListPhotosOpts,
  Photo,
  RollPhoto,
  StorageInfo,
  TransferInfo,
  TransferJob,
  UsageInfo,
} from "./types";

export const api = {
  // settings & info
  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  getStorageInfo: () => invoke<StorageInfo>("get_storage_info"),

  // photos
  listPhotos: (opts: ListPhotosOpts = {}) =>
    invoke<Photo[]>("list_photos", {
      query: opts.query ?? null,
      sort: opts.sort ?? "captured",
      desc: opts.desc ?? true,
      favoritesOnly: opts.favoritesOnly ?? false,
      dateFrom: opts.dateFrom ?? null,
      dateTo: opts.dateTo ?? null,
    }),
  getPhoto: (id: number) => invoke<Photo>("get_photo", { id }),
  updatePhoto: (id: number, isFavorite?: boolean, userNote?: string) =>
    invoke<void>("update_photo", { id, isFavorite: isFavorite ?? null, userNote: userNote ?? null }),
  getPhotoUsage: (ids: number[]) => invoke<UsageInfo>("get_photo_usage", { ids }),
  removePhotos: (ids: number[], deleteFiles: boolean) =>
    invoke<void>("remove_photos", { ids, deleteFiles }),
  cancelImport: () => invoke<void>("cancel_import"),
  importPhotos: (paths: string[], source?: string) =>
    invoke<ImportSummary>("import_photos", { paths, source: source ?? null }),

  // albums
  createAlbum: (name: string, description?: string) =>
    invoke<Album>("create_album", { name, description: description ?? null }),
  listAlbums: () => invoke<Album[]>("list_albums"),
  updateAlbum: (id: number, fields: { name?: string; description?: string; coverPhotoId?: number }) =>
    invoke<void>("update_album", { id, ...fields }),
  deleteAlbum: (id: number) => invoke<void>("delete_album", { id }),
  getAlbumPhotos: (albumId: number) => invoke<AlbumPhoto[]>("get_album_photos", { albumId }),
  addAlbumPhotos: (albumId: number, photoIds: number[]) =>
    invoke<void>("add_album_photos", { albumId, photoIds }),
  removeAlbumPhotos: (albumId: number, photoIds: number[]) =>
    invoke<void>("remove_album_photos", { albumId, photoIds }),
  reorderAlbumPhotos: (albumId: number, photoIds: number[]) =>
    invoke<void>("reorder_album_photos", { albumId, photoIds }),
  exportAlbum: (albumId: number, destPath: string, asZip: boolean) =>
    invoke<ExportResult>("export_album", { albumId, destPath, asZip }),

  // film rolls
  createFilmRoll: (name: string, description?: string, targetFrames?: number) =>
    invoke<FilmRoll>("create_film_roll", { name, description: description ?? null, targetFrames: targetFrames ?? null }),
  listFilmRolls: () => invoke<FilmRoll[]>("list_film_rolls"),
  updateFilmRoll: (
    id: number,
    fields: {
      name?: string;
      description?: string;
      targetFrames?: number;
      startDate?: number | null;
      endDate?: number | null;
      coverPhotoId?: number;
    },
  ) => invoke<void>("update_film_roll", { id, ...fields }),
  deleteFilmRoll: (id: number) => invoke<void>("delete_film_roll", { id }),
  getFilmRollPhotos: (rollId: number) => invoke<RollPhoto[]>("get_film_roll_photos", { rollId }),
  addFilmRollPhotos: (rollId: number, photoIds: number[]) =>
    invoke<void>("add_film_roll_photos", { rollId, photoIds }),
  removeFilmRollPhotos: (rollId: number, photoIds: number[]) =>
    invoke<void>("remove_film_roll_photos", { rollId, photoIds }),
  reorderFilmRollPhotos: (rollId: number, photoIds: number[]) =>
    invoke<void>("reorder_film_roll_photos", { rollId, photoIds }),

  // composer
  saveComposerProject: (
    id: number | null,
    name: string,
    project: unknown,
    canvasWidth: number,
    canvasHeight: number,
  ) => invoke<number>("save_composer_project", { id, name, project, canvasWidth, canvasHeight }),
  listComposerProjects: () => invoke<ComposerProject[]>("list_composer_projects"),
  getComposerProject: (id: number) => invoke<ComposerProject>("get_composer_project", { id }),
  deleteComposerProject: (id: number) => invoke<void>("delete_composer_project", { id }),
  saveCanvasExport: (dataUrl: string, destPath: string) =>
    invoke<void>("save_canvas_export", { dataUrl, destPath }),

  // export
  exportPhotos: (ids: number[], destPath: string, format: string, quality: number) =>
    invoke<ExportResult>("export_photos", { ids, destPath, format, quality }),
  cancelExport: () => invoke<void>("cancel_export"),

  // backup
  runBackup: (destPath: string) => invoke<BackupJob>("run_backup", { destPath }),
  getBackupHistory: () => invoke<BackupJob[]>("get_backup_history"),
  verifyBackup: (backupPath: string) => invoke<{ file: string; error: string }[]>("verify_backup", { backupPath }),

  // transfer
  startTransfer: (port?: number) => invoke<TransferInfo>("start_transfer_server", { port: port ?? null }),
  stopTransfer: () => invoke<void>("stop_transfer_server"),
  getTransferState: () => invoke<TransferInfo>("get_transfer_state"),
  listTransferJobs: () => invoke<TransferJob[]>("list_transfer_jobs"),

  // editor
  getPhotoEdit: (photoId: number) => invoke<Record<string, unknown> | null>("get_photo_edit", { photoId }),
  savePhotoEdit: (photoId: number, settings: unknown) =>
    invoke<void>("save_photo_edit", { photoId, settings }),
  clearPhotoEdit: (photoId: number) => invoke<void>("clear_photo_edit", { photoId }),
  listEditorPresets: () => invoke<EditorPreset[]>("list_editor_presets"),
  saveEditorPreset: (name: string, settings: unknown) =>
    invoke<number>("save_editor_preset", { name, settings }),
  deleteEditorPreset: (id: number) => invoke<void>("delete_editor_preset", { id }),
  importLut: (sourcePath: string) => invoke<string>("import_lut", { sourcePath }),
  listCustomLuts: () => invoke<string[]>("list_custom_luts"),
  deleteLut: (name: string) => invoke<void>("delete_lut", { name }),
  readCustomLut: (name: string) => invoke<string>("read_custom_lut", { name }),
  addRenderedPhoto: (dataUrl: string, parentId: number | null) =>
    invoke<Photo>("add_rendered_photo", { dataUrl, parentId }),
};
