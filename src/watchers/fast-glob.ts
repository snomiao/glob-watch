import {
  WatchCallback,
  WatchOptions,
  DestroyFunction,
  FileChanges,
  FileInfo,
} from "../types.ts";
import path from "node:path";

/**
 * Uses fast-glob to perform a one-time scan of files matching the provided patterns.
 * This is useful for CLI applications or environments where watchman is not available.
 */
export const watch = async (
  patterns: string | string[],
  callback: WatchCallback,
  options: WatchOptions = {},
): Promise<DestroyFunction> => {
  let fg = (await import("fast-glob")).default;
  const cwd = options.cwd || process.cwd();
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];

  try {
    // Run fast-glob to find matching files
    const entries = await fg(patternArray, {
      cwd,
      absolute: false,
      onlyDirectories: options.onlyDirectories || false,
      // Default to true
      onlyFiles: options.onlyFiles !== false,
      dot: options.dot || false,
      // Get file stats for additional information
      followSymbolicLinks: false,
      stats: true,
      ignore: options.ignore
        ? Array.isArray(options.ignore)
          ? options.ignore
          : [options.ignore]
        : [],
    });

    // Create the changes object to pass to the callback
    const changes: FileChanges = {
      added: new Map<string, FileInfo>(),
      deleted: new Map<string, FileInfo>(),
      changed: new Map<string, FileInfo>(),
    };

    // Process each file entry
    for (const entry of entries) {
      let filePath;
      let stats;

      // Handle different return types from fast-glob based on options
      if (typeof entry === "string") {
        filePath = entry;
        // We don't have stats in this case
      } else {
        // Entry is an object with path and stats
        filePath = entry.path;
        stats = entry.stats;
      }

      // Create the file info object
      const fileInfo: FileInfo = {
        name: path.basename(filePath),
        path: options.absolute ? path.resolve(cwd, filePath) : filePath,
        exists: true,
      };

      // Add requested fields if available from stats
      if (stats && options.fields) {
        if (options.fields.includes("type")) {
          fileInfo.type = stats.isDirectory() ? "d" : "f";
        }
        if (options.fields.includes("size")) {
          fileInfo.size = stats.size;
        }
        if (options.fields.includes("mtime")) {
          fileInfo.mtime = stats.mtimeMs;
        }
        if (options.fields.includes("type") && stats.isSymbolicLink()) {
          fileInfo.type = "l";
        }
      }

      // Add to the added files list
      changes.added.set(fileInfo.path, fileInfo);
    }

    // Call the callback with our file changes
    await callback(changes);
  } catch (error) {
    console.error("Error in fast-glob scan:", error);
    throw error;
  }

  // Return a destroy function that does nothing since this is a one-time operation
  return () => {
    // No cleanup needed for fast-glob
  };
};
