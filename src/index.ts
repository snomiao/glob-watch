import {
  WatchCallback,
  WatchOptions,
  DestroyFunction,
  CreateWatcher,
} from "./types.ts";

/**
 * Watch for file changes that match the given glob pattern(s)
 *
 * @param patterns Glob pattern(s) to watch
 * @param callback Function to call when files change
 * @param options Watch options
 * @returns A function that will stop watching
 *
 * @example
 *
 */
export async function watch(
  patterns: string | string[],
  callback: WatchCallback,
  options: WatchOptions = {},
): Promise<DestroyFunction> {
  let watcher: CreateWatcher;

  switch (options.mode) {
    case "watchman":
      watcher = (await import("./watchers/watchman.ts")).watch;
      break;
    case "native":
      watcher = (await import("./watchers/native.ts")).watch;
      break;
    case "fast-glob":
      watcher = (await import("./watchers/fast-glob.ts")).watch;
      break;
    default:
      throw new Error(`Unknown watcher mode: ${options.mode}`);
  }
  return watcher(patterns, callback, options);
}

/**
 * Find file that match the given glob pattern(s)
 *
 * @param patterns Glob pattern(s) to watch
 * @param options Watch options
 * @returns A promise that resolves to an array of file paths
 *
 */
export async function findFiles(
  patterns: string | string[],
  options: WatchOptions = {},
): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const destroy = await watch(
        patterns,
        (fileChange) => {
          const files: string[] = [];
          for (const [fileName, fileMeta] of fileChange.added) {
            if (fileMeta.exists) {
              files.push(fileName);
            }
          }
          resolve(files);
        },
        options,
      );
      destroy();
    } catch (error) {
      reject(error);
    }
  });
}

// Re-export types
export * from "./types.ts";
