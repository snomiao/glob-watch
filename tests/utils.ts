import fs from "fs";
import path from "path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates files based on a tree structure representation
 *
 * @param baseDir - The base directory where files will be created
 * @param treeString - A string representation of the file tree
 */
export async function createFiles(
  baseDir: string,
  treeString: string,
): Promise<void> {
  // Make sure the base directory exists
  fs.mkdirSync(baseDir, { recursive: true });

  // Split the tree string into lines and remove any empty lines
  const lines = treeString.split("\n").filter((line) => line.trim().length > 0);

  // Process lines to create a nested structure representation
  // Track the current path at each indentation level
  const pathAtIndent: Record<number, string[]> = {};
  let lastIndent = -1;
  let createdFiles = await countFile(baseDir);

  for (const line of lines) {
    // Find position of the branch indicator
    const branchPos = Math.max(line.indexOf("├─"), line.indexOf("└─"));

    // Skip if no branch indicator is found
    if (branchPos === -1) continue;

    // Get the item name (file or directory)
    const itemName = line.substring(branchPos + 2).trim();

    // Calculate indent level based on position
    const currentIndent = Math.floor(branchPos / 3);

    // Clear any deeper indentation levels from our tracking
    Object.keys(pathAtIndent).forEach((level) => {
      if (Number(level) > currentIndent) {
        delete pathAtIndent[level];
      }
    });

    // Get the current path array for this indentation level
    if (currentIndent === 0) {
      // Root level items
      pathAtIndent[currentIndent] = [itemName];
    } else {
      // Find the parent path from the previous indent level
      const parentIndent = currentIndent - 1;
      const parentPath = pathAtIndent[parentIndent] || [];

      // Create or update the path at the current indent level
      pathAtIndent[currentIndent] = [...parentPath, itemName];
    }

    // Build the full file system path
    const relativeFilePath = pathAtIndent[currentIndent].join("/");
    const fullPath = path.join(baseDir, relativeFilePath);

    // Determine if it's a directory or file
    const isDirectory = !itemName.includes(".");

    if (isDirectory) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      // Create file with empty content or the name as content
      fs.writeFileSync(fullPath, itemName);
      createdFiles++;
    }

    lastIndent = currentIndent;
  }

  await sleep(20);
  const countOnDisk = await countFile(baseDir);
  if (createdFiles !== countOnDisk) {
    throw new Error(
      `Expected ${createdFiles} files, but found ${countOnDisk} files.`,
    );
  }
}

async function countFile(baseDir: string): Promise<number> {
  const { default: fastGlob } = await import("fast-glob");
  // verify that all files are created
  const files = await fastGlob([path.join(baseDir, "**/*")], {
    dot: true,
    absolute: true,
    onlyFiles: true,
    cwd: baseDir,
  });
  return files.length;
}

/**
 * Deletes a directory and all its contents recursively
 *
 * @param dir - The directory to delete
 */
export function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Creates a temporary directory for a test
 *
 * @param testName - The name of the test to create a directory for
 * @returns The path to the created directory
 */
export function createTestDir(testName: string): string {
  const testDir = path.join(process.cwd(), "tests", "temp", testName);
  cleanupDir(testDir);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Creates a callback function that tracks its invocations and provides
 * promise-based access to callback arguments.
 *
 * @returns An enhanced callback function with additional utility methods
 */
export function createCallTracker<Args extends any[]>() {
  const callHistory: Args[] = [];
  let nextResolve: (value: Args) => void = () => {};
  let nextPromise = new Promise<Args>((resolve) => {
    nextResolve = resolve;
  });

  // Create the base callback function
  function callback(...args: Args): void {
    callHistory.push(args);
    nextResolve(args);
    nextPromise = new Promise<Args>((resolve) => {
      nextResolve = resolve;
    });
  }

  // Attach methods and properties to the callback function
  return Object.assign(callback, {
    /**
     * Waits for and returns the next callback invocation arguments
     */
    next: async (): Promise<Args> => nextPromise,

    /**
     * Returns the most recent callback invocation arguments
     * If no callbacks have been made yet, waits for the next one
     */
    latest: async (): Promise<Args> => {
      if (callHistory.length === 0) {
        return nextPromise;
      }
      return callHistory[callHistory.length - 1];
    },

    /**
     * Returns an array of all callback invocation arguments
     */
    get all() {
      return [...callHistory];
    },

    /**
     * Returns the number of times the callback has been invoked
     */
    get count() {
      return callHistory.length;
    },

    /**
     * Resets the tracker, clearing all history
     */
    reset: () => {
      callHistory.length = 0;
      nextPromise = new Promise<Args>((resolve) => {
        nextResolve = resolve;
      });
    },
  });
}
