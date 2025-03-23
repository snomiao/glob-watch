import {
  WatchCallback,
  WatchOptions,
  DestroyFunction,
  FileChanges,
  FileInfo,
} from "../types.ts";
import path from "node:path";
import type {
  Client,
  Expression,
  FileChange,
  SubscriptionConfig,
  SubscriptionResponse,
} from "fb-watchman";
import { logError } from "../errors.ts";

export const watch = async (
  patterns: string | string[],
  callback: WatchCallback,
  options: WatchOptions = {},
): Promise<DestroyFunction> => {
  let client: Client;
  try {
    client = await createWatchmanClient();
  } catch (error) {
    logError("Failed to create Watchman client", error);
    // Fall back to native watcher
    const { watch } = await import("./native.ts");
    return watch(patterns, callback, options);
  }

  const cwd = options.cwd || process.cwd();
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];

  // Track existing files
  const existingFiles = new Map<string, FileInfo>();

  // Get the watch root
  const watchProjectRoot = await new Promise<string>((resolve, reject) => {
    client.command(["watch-project", cwd], (error, resp) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(resp.watch);
    });
  });

  // Helper function to create a file info object
  const createFileInfo = (file: FileChange, rootPath: string): FileInfo => {
    const relativePath = file.name;
    const info: FileInfo = {
      name: path.basename(relativePath),
      path: options.absolute
        ? path.resolve(rootPath, relativePath)
        : relativePath,
    };
    if ("exists" in file) {
      info.exists = file.exists;
    }
    if ("type" in file) {
      info.type = file.type;
    }

    // Add requested fields
    if (options.fields) {
      if (options.fields.includes("size") && "size" in file) {
        info.size = file.size;
      }
      if (options.fields.includes("mtime") && "mtime_ms" in file) {
        info.mtime =
          typeof file.mtime_ms === "number" ? file.mtime_ms : undefined;
      }
    }

    return info;
  };

  // Setup subscription
  const subscriptionName =
    "glob-watch-" + Math.random().toString(36).substring(2, 15);

  // Create file filters based on options
  const fileFilters: any[] = [];

  // Only files or only directories filter
  if (options.onlyDirectories) {
    fileFilters.push(["type", "d"]);
  } else if (options.onlyFiles) {
    fileFilters.push(["type", "f"]);
  }

  // Process patterns into watchman expressions
  const matchExpressions = patternArray.map(
    (pattern): Expression =>
      [
        "match",
        pattern,
        "wholename",
        { includedotfiles: options.dot },
      ] as const as any,
  );

  // Build the final expression
  const expression = [
    "allof",
    ...fileFilters,
    ["anyof", ...matchExpressions],
  ] as Expression;

  // Determine fields to request from watchman
  const requestFields: (keyof FileChange)[] = ["name", "exists", "type"];
  if (options.fields) {
    if (options.fields.includes("size")) {
      requestFields.push("size");
    }
    if (options.fields.includes("mtime")) {
      requestFields.push("mtime_ms");
    }
  }

  // Setup the subscription
  await new Promise<void>((resolve, reject) => {
    client.command(
      [
        "subscribe",
        watchProjectRoot,
        subscriptionName,
        {
          expression: expression,
          fields: requestFields,
          relative_root: path.relative(watchProjectRoot, cwd),
        } satisfies SubscriptionConfig,
      ],
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });

  // Process initial file list

  await new Promise<void>((resolve) => {
    const initialRun = (resp: SubscriptionResponse) => {
      if (resp.subscription !== subscriptionName) {
        return;
      }

      client.removeListener("subscription", initialRun);

      const changes: FileChanges = {
        added: new Map<string, FileInfo>(),
        deleted: new Map<string, FileInfo>(),
        changed: new Map<string, FileInfo>(),
      };

      // Process each file
      resp.files.forEach((file) => {
        const fileInfo = createFileInfo(file, cwd);

        // Add to existing files map
        if (file.exists !== false) {
          existingFiles.set(fileInfo.path, fileInfo);
          changes.added.set(fileInfo.path, fileInfo);
        }
      });

      // Call the callback with initial files
      callback(changes);
      resolve();
    };
    // Set up initial run handler
    client.on("subscription", initialRun);
  });

  // Set up ongoing change handler
  client.on("subscription", (resp) => {
    if (resp.subscription !== subscriptionName) {
      return;
    }

    const changes: FileChanges = {
      added: new Map<string, FileInfo>(),
      deleted: new Map<string, FileInfo>(),
      changed: new Map<string, FileInfo>(),
    };

    // Process each file change
    resp.files.forEach((file: any) => {
      const fileInfo = createFileInfo(file, cwd);
      const fileExists = file.exists !== false;
      const existingFile = existingFiles.get(fileInfo.path);

      if (!existingFile && fileExists) {
        // New file
        existingFiles.set(fileInfo.path, fileInfo);
        changes.added.set(fileInfo.path, fileInfo);
      } else if (existingFile && !fileExists) {
        // Deleted file
        existingFiles.delete(fileInfo.path);
        changes.deleted.set(fileInfo.path, fileInfo);
      } else if (existingFile && fileExists) {
        // Changed file
        existingFiles.set(fileInfo.path, fileInfo);
        changes.changed.set(fileInfo.path, fileInfo);
      }
    });

    // Only call callback if there are changes
    if (
      changes.added.size > 0 ||
      changes.deleted.size > 0 ||
      changes.changed.size > 0
    ) {
      callback(changes);
    }
  });

  // Return destroy function
  return () => {
    client.end();
  };
};

/**
 * Create a Watchman client and verify its capabilities
 */
async function createWatchmanClient(): Promise<Client> {
  // Import fb-watchman dynamically to handle the case when it's not installed
  const { default: watchman } = await import("fb-watchman");
  const client = new watchman.Client();
  return new Promise<Client>((resolve, reject) => {
    const errorHandler = (error: Error) => {
      client.removeListener("error", errorHandler);
      client.removeListener("connect", connectHandler);
      reject(error);
    };

    const connectHandler = () => {
      client.removeListener("error", errorHandler);
      client.removeListener("connect", connectHandler);
      resolve(client);
    };

    client.on("error", errorHandler);
    client.on("connect", connectHandler);

    client.capabilityCheck(
      { optional: [], required: ["relative_root"] },
      (error: Error | null) => {
        if (error) {
          errorHandler(error);
        }
      },
    );
  });
}
