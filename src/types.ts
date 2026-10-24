export interface Photo {
  id: number;
  filePath: string;
  originalFilename: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  capturedAt: number | null;
  dateSource: "exif" | "imported";
  importedAt: number;
  cameraModel: string | null;
  metadata: Record<string, unknown>;
  isFavorite: boolean;
  userNote: string;
  thumbnailPath: string;
  source: string;
}

export interface Album {
  id: number;
  name: string;
  description: string;
  coverPhotoId: number | null;
  coverThumb: string | null;
  photoCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FilmRoll {
  id: number;
  name: string;
  description: string;
  targetFrames: number;
  startDate: number | null;
  endDate: number | null;
  coverPhotoId: number | null;
  coverThumb: string | null;
  photoCount: number;
  createdAt: number;
}

export interface AlbumPhoto {
  photo: Photo;
  sortOrder: number;
}

export interface RollPhoto {
  photo: Photo;
  frameNumber: number;
  sortOrder: number;
}

export interface FailedFile {
  file: string;
  error: string;
}

export interface ImportSummary {
  imported: number;
  duplicates: number;
  failed: number;
  total: number;
  duplicateFiles: string[];
  failedFiles: FailedFile[];
  photoIds: number[];
}

export interface ExportResult {
  exported: number;
  failed: number;
  cancelled: boolean;
  failedFiles: FailedFile[];
}

export interface UsageInfo {
  albums: number;
  rolls: number;
  composerProjects: number;
}

export interface StorageInfo {
  originalsBytes: number;
  thumbnailsBytes: number;
  databaseBytes: number;
  freeBytes: number | null;
  libraryRoot: string;
}

export interface TransferInfo {
  running: boolean;
  port: number;
  ip: string;
  url: string;
  token: string;
  expiresAt: number;
  receivedCount: number;
  failedCount: number;
  maxFileMb: number;
  maxFiles: number;
}

export interface TransferJob {
  id: number;
  sourceDevice: string;
  destinationPath: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  status: string;
  startedAt: number;
  completedAt: number | null;
}

export interface BackupJob {
  id: number;
  destinationPath: string;
  status: string;
  filesProcessed: number;
  filesFailed: number;
  totalBytes: number;
  startedAt: number;
  completedAt: number | null;
}

export interface ComposerProject {
  id: number;
  name: string;
  project: Record<string, unknown>;
  canvasWidth: number;
  canvasHeight: number;
  createdAt: number;
  updatedAt: number;
}

export interface EditorPreset {
  id: number;
  name: string;
  settings: Record<string, unknown>;
  createdAt: number;
}

export type SortKey = "captured" | "imported" | "name" | "size";

export interface ListPhotosOpts {
  query?: string;
  sort?: SortKey;
  desc?: boolean;
  favoritesOnly?: boolean;
  dateFrom?: number;
  dateTo?: number;
}
