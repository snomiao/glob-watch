import {
  WatchCallback,
  WatchOptions,
  DestroyFunction,
  FileChanges,
  FileInfo,
} from "../types.ts";
import path from "node:path";
import fs from "node:fs";
import { watch as fastGlobWatch } from "./fast-glob.ts";

/**
 * Watch for file changes using Node.js native fs.watch API
 * with fast-glob for initial file discovery as fallback if watchman is not available
 */
export async function watch(
  patterns: string | string[],
  callback: WatchCallback,
  options: WatchOptions = {},
): Promise<DestroyFunction> {
  // State variables (captured in closure)
  const watchers = new Set<fs.FSWatcher>();
  const fileInfoMap = new Map<string, FileInfo>();
  const watchDirs = new Set<string>();
  const cwd = options.cwd || process.cwd();

  // Create ignore matcher
  const ignoreMatcher = await createIgnoreMatcher(options.ignore);

  // Get initial file list using fast-glob
  const initialScan = await new Promise<FileChanges>((resolve) => {
    // Create a temporary callback that captures the initial file list
    const tempCallback = (changes: FileChanges) => {
      resolve(changes);
    };

    // Use fast-glob watcher to get initial file list
    fastGlobWatch(patterns, tempCallback, options);
  });

  // Store initial files in our map
  for (const [filePath, fileInfo] of initialScan.added) {
    fileInfoMap.set(filePath, fileInfo);
  }

  // Call callback with initial files
  await callback(initialScan);

  // Extract directories from file paths
  const watchDirectories = new Set<string>();
  for (const filePath of fileInfoMap.keys()) {
    const absPath = options.absolute ? filePath : path.resolve(cwd, filePath);
    const dirPath = path.dirname(absPath);
    watchDirectories.add(dirPath);
  }

  // Create directory watchers
  for (const dirPath of watchDirectories) {
    try {
      setupDirectoryWatcher(dirPath);
    } catch (error) {
      console.error(`Error watching directory ${dirPath}:`, error);
    }
  }

  /**
   * Handle file change events
   */
  function handleFileChange(filePath: string, eventType: string): void {
    const absolutePath = path.resolve(cwd, filePath);

    // Skip hidden files if dot option is not enabled
    if (!options.dot && path.basename(filePath).startsWith(".")) {
      return;
    }

    // Skip ignored files
    if (ignoreMatcher(filePath)) {
      return;
    }

    const changes: FileChanges = {
      added: new Map<string, FileInfo>(),
      deleted: new Map<string, FileInfo>(),
      changed: new Map<string, FileInfo>(),
    };

    try {
      // Check if file exists
      const exists = fs.existsSync(absolutePath);
      const isNewFile = !fileInfoMap.has(filePath);
      const stats = exists && fs.statSync(absolutePath);

      if (stats) {
        const isDir = stats.isDirectory();
        // Create file info
        const fileInfo: FileInfo = {
          name: path.basename(filePath),
          path: filePath,
          exists: true,
        };

        // If it's a directory, watch it too
        if (isDir && !watchDirs.has(filePath)) {
          setupDirectoryWatcher(filePath);
        }

        if (isDir && options.onlyFiles) {
          // Skip directories if onlyFiles option is enabled
          return;
        }

        // Add requested fields
        if (options.fields) {
          if (options.fields.includes("type")) {
            fileInfo.type = isDir ? "d" : "f";
          }
          if (options.fields.includes("size")) {
            fileInfo.size = stats.size;
          }
          if (options.fields.includes("mtime")) {
            fileInfo.mtime = stats.mtimeMs;
          }
        }

        if (isNewFile) {
          // New file
          fileInfoMap.set(filePath, fileInfo);
          changes.added.set(filePath, fileInfo);
        } else {
          // Changed file
          fileInfoMap.set(filePath, fileInfo);
          changes.changed.set(filePath, fileInfo);
        }
      } else if (!isNewFile) {
        // File was deleted
        const fileInfo = fileInfoMap.get(filePath)!;
        fileInfoMap.delete(filePath);
        changes.deleted.set(filePath, fileInfo);
      }

      // Notify callback if there are changes
      if (
        changes.added.size > 0 ||
        changes.changed.size > 0 ||
        changes.deleted.size > 0
      ) {
        callback(changes);
      }
    } catch (error) {
      console.error(`Error handling file change for ${filePath}:`, error);
    }
  }

  /**
   * Set up watcher for a directory
   */
  function setupDirectoryWatcher(dirPath: string): void {
    // Skip if already watching this directory
    if (watchDirs.has(dirPath)) {
      return;
    }

    try {
      const watcher = fs.watch(
        dirPath,
        { recursive: false },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(dirPath, filename);
          const filePath = options.absolute
            ? fullPath
            : path.relative(cwd, fullPath);

          handleFileChange(filePath, eventType);
        },
      );

      watchers.add(watcher);
      watchDirs.add(dirPath);

      // Also watch subdirectories if they exist
      watchSubdirectories(dirPath);
    } catch (error) {
      console.error(`Failed to watch directory ${dirPath}:`, error);
    }
  }

  /**
   * Watch subdirectories recursively
   */
  function watchSubdirectories(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = path.join(dirPath, entry.name);
          setupDirectoryWatcher(subDirPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
  }

  /**
   * Clean up all watchers
   */
  function destroy(): void {
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers.clear();
    watchDirs.clear();
    fileInfoMap.clear();
  }

  // Return destroy function
  return destroy;
}

/**
 * Creates a matcher function for ignore patterns
 */
async function createIgnoreMatcher(ignore?: string | string[]) {
  if (!ignore) {
    return () => false;
  }
  const micromatch = await import("micromatch");
  const patterns = Array.isArray(ignore) ? ignore : [ignore];
  // Precompile matchers for each pattern
  const matchers = patterns.map((pattern) => micromatch.matcher(pattern));
  // Create a single matcher function that checks all patterns
  return (filePath: string) => matchers.some((matcher) => matcher(filePath));
}
