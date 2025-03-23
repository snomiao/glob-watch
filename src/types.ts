/**
 * Information about a watched file
 */
export interface FileInfo {
  // Base fields that will always be available
  name: string;
  path: string;

  // Optional fields based on the watcher capabilities and requested fields
  exists?: boolean;
  type?: string;
  size?: number;
  mtime?: number;
}

/**
 * Changes detected by the watcher
 */
export interface FileChanges {
  added: Map<string, FileInfo>;
  deleted: Map<string, FileInfo>;
  changed: Map<string, FileInfo>;
}

/**
 * The callback function that will be called when files change
 */
export type WatchCallback = (changes: FileChanges) => void | Promise<void>;

/**
 * The available watcher modes
 */
export type WatcherMode = "watchman" | "native" | "fast-glob";

/**
 * Options for the watch function
 */
export interface WatchOptions {
  /**
   * The watcher implementation to use
   * @default 'watchman'
   */
  mode?: WatcherMode;

  /**
   * Fields to include in the FileInfo objects
   */
  fields?: Array<"type" | "size" | "mtime">;

  /**
   * Return absolute paths instead of relative paths
   * @default false
   */
  absolute?: boolean;

  /**
   * Return only directories
   * @default false
   */
  onlyDirectories?: boolean;

  /**
   * Return only files
   * @default true
   */
  onlyFiles?: boolean;

  /**
   * Allow patterns to match entries that begin with a period (.)
   * @default false
   */
  dot?: boolean;

  /**
   * The directory to use as the base for relative paths
   * @default process.cwd()
   */
  cwd?: string;
}

/**
 * A function that will stop watching for changes
 */
export type DestroyFunction = () => void;

/**
 * Interface that all watcher implementations must implement
 */
export type CreateWatcher = (
  patterns: string | string[],
  callback: WatchCallback,
  options?: WatchOptions,
) => Promise<DestroyFunction>;
