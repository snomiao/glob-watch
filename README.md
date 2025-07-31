forked by @snomiao, for fixing tests and package exports

# @jantimon/glob-watch

[![npm version](https://badge.fury.io/js/%40jantimon%2Fglob-watch.svg)](https://badge.fury.io/js/%40jantimon%2Fglob-watch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, flexible file watching utility with smart backend selection

## Features

- **Multiple watching strategies:**
  - Uses `fb-watchman` for maximum performance when available
  - Falls back to Node.js native `fs.watch` with glob matching
  - Supports one-time scanning with `fast-glob`
- **Modern & developer-friendly:**
  - TypeScript native (no compilation needed for Node.js 22+, Bun, and Deno)
  - Consistent API across all watching backends
  - Minimal dependencies

## Motivation

Traditional file watchers often force a trade-off between performance, flexibility, and consistency. With @jantimon/glob-watch, you get:

- **Optimal performance** by leveraging Facebook's Watchman when available
- **Environment adaptability** with automatic fallbacks for CI environments or platforms like Stackblitz
- **Unified API** regardless of which backend is handling the watching
- **Precise control** over which file information is collected
- **Dual-purpose functionality** with both watching (`watch`) and one-time file discovery (`findFiles`)

## Installation

```bash
npm install @jantimon/glob-watch
```

Recommended - for optimal watcher performance, consider installing the optional Watchman dependency:

```bash
npm install fb-watchman
```

## Basic Usage

### Watch for Changes

```typescript
import { watch } from "@jantimon/glob-watch";

// Start watching files
const destroy = await watch("src/**/*.ts", (changes) => {
  console.log("Added files:", changes.added);
  console.log("Changed files:", changes.changed);
  console.log("Deleted files:", changes.deleted);
});

// Stop watching when done
destroy();
```

### Find Files (One-time Operation)

```typescript
import { findFiles } from "@jantimon/glob-watch";

// Perfect for build scripts and CI environments
const files = await findFiles("src/**/*.ts");
console.log(`Found ${files.length} TypeScript files`);
```

## API

### watch(patterns, callback, [options])

Starts watching files that match the provided glob pattern(s).

#### Parameters

- `patterns`: `string | string[]` - Glob pattern(s) to match
- `callback`: `(changes: FileChanges) => void | Promise<void>` - Callback function that receives file changes
- `options`: `WatchOptions` (optional) - Configuration options

#### Returns

- `Promise<DestroyFunction>` - A function to stop watching

### findFiles(patterns, [options])

Performs a one-time scan for files matching the provided glob pattern(s).

#### Parameters

- `patterns`: `string | string[]` - Glob pattern(s) to match
- `options`: `WatchOptions` (optional) - Configuration options

#### Returns

- `Promise<string[]>` - Array of matching file paths

### FileChanges

An object containing maps of file changes:

```typescript
interface FileChanges {
  added: Map<string, FileInfo>; // New files
  changed: Map<string, FileInfo>; // Modified files
  deleted: Map<string, FileInfo>; // Removed files
}
```

### FileInfo

Information about a file:

```typescript
interface FileInfo {
  // Base fields that will always be available
  name: string; // Filename
  path: string; // Path to the file (relative or absolute based on options)

  // Optional fields that can be requested
  exists?: boolean;
  type?: string; // File type
  size?: number; // File size in bytes
  mtime?: number; // Modification time
}
```

## Options

Both `watch` and `findFiles` accept the same options object:

```typescript
{
  // Watcher backend selection (for watch function)
  mode?: "watchman" | "native" | "fast-glob";

  // Which information to include in FileInfo objects
  fields?: Array<"type" | "size" | "mtime">;

  // Path handling
  absolute?: boolean; // Return absolute paths (default: false)
  cwd?: string;       // Base directory for relative paths (default: process.cwd())

  // File filtering
  onlyDirectories?: boolean; // Return only directories (default: false)
  onlyFiles?: boolean;       // Return only files (default: true)

  // Pattern matching
  dot?: boolean;  // Match files starting with . (default: false)
}
```

## Watcher Backends

### watchman (default)

Uses Facebook's [Watchman](https://facebook.github.io/watchman/) through the `fb-watchman` npm package. Offers the best performance and scalability for large projects.

### native

Uses Node.js built-in `fs.watch` API combined with `fast-glob` for initial file discovery and pattern matching. Available everywhere without external Watchman dependency. Used as default fallback for `watch` if `fb-watchman` is not installed.

### fast-glob

Performs a single scan using the `fast-glob` package and immediately returns. Useful for one-time operations when you don't need continuous watching. Used as default fallback for `findFiles` if `fb-watchman` is not installed.

## Examples

### Watch Multiple Patterns

```typescript
const destroy = await watch(["src/**/*.ts", "test/**/*.ts"], (changes) => {
  // Handle changes
});
```

### Request Specific File Information

```typescript
const destroy = await watch(
  "**/*.js",
  (changes) => {
    for (const [path, info] of changes.added) {
      console.log(
        `New file ${path} with size ${info.size} bytes, modified at ${new Date(info.mtime)}`,
      );
    }
  },
  {
    fields: ["size", "mtime", "type"],
  },
);
```

### One-time Scan

There are two ways to perform a one-time scan:

```typescript
// Method 1: Using findFiles
const files = await findFiles("**/*.json");
console.log(`Found ${files.length} JSON files`);

// Method 2: Using watch with fast-glob mode
const destroy = await watch("**/*.json", (changes) => {
  // This callback runs once with all matching files in changes.added
  console.log(`Found ${changes.added.size} JSON files`);
});
// Stop watching immediately after the initial scan
destroy();
```

### Working with Absolute Paths

```typescript
const destroy = await watch(
  "src/**/*.ts",
  (changes) => {
    // All paths in changes will be absolute
    for (const path of changes.added.keys()) {
      console.log(`Found: ${path}`);
    }
  },
  { absolute: true },
);
```

### Focus on Directories Only

```typescript
const destroy = await watch(
  "src/**/*",
  (changes) => {
    // Only directories will be reported
  },
  {
    onlyDirectories: true,
    onlyFiles: false,
  },
);
```

## Dependencies

- **Required peer dependency:**
  - `fast-glob`: For pattern matching in both `native` and `fast-glob` modes

- **Optional dependency:**
  - `fb-watchman`: For using the high-performance Watchman backend

If `fb-watchman` isn't available, `@jantimon/glob-watch` will automatically fallback to `native` mode.

## Compatibility

- **Node.js:** v22.0.0 or higher recommended for TypeScript native support
- **Other runtimes:** Compatible with Bun and Deno

For optimal testing, ensure Watchman is installed on your system.

## License

[MIT](https://opensource.org/licenses/MIT)
