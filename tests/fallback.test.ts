import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { watch, findFiles, FileChanges } from "../src/index";
import {
  createTestDir,
  createFiles,
  cleanupDir,
  createCallTracker,
} from "./utils";
import fs from "fs";
import path from "path";

// Mock fb-watchman to simulate it not being available
vi.mock("fb-watchman", () => {
  return { default: null };
});

vi.mock("../src/errors.ts", () => {
  return {
    logError: vi.fn(),
  };
});

describe("Watchman Fallback watcher", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir("fallback-test");
  });

  afterEach(() => {
    cleanupDir(testDir);
  });

  it("should find all TypeScript files using findFiles", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    const files = await findFiles(["**/*.ts"], {
      cwd: testDir,
      mode: "watchman",
    });

    expect(files.length).toBe(3);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/components/button.ts");
    expect(files).toContain("src/components/card.ts");
  });

  it("should find files with multiple patterns", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      ├─ src
      │  ├─ index.ts
      │  └─ components
      │     ├─ button.ts
      │     └─ card.ts
      └─ tests
         ├─ index.test.ts
         └─ components
            ├─ button.test.ts
            └─ card.test.ts
    `,
    );

    const files = await findFiles(["src/**/*.ts", "tests/**/*.test.ts"], {
      cwd: testDir,
      mode: "watchman",
    });

    expect(files.length).toBe(6);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/components/button.ts");
    expect(files).toContain("src/components/card.ts");
    expect(files).toContain("tests/index.test.ts");
    expect(files).toContain("tests/components/button.test.ts");
    expect(files).toContain("tests/components/card.test.ts");
  });

  it("should return absolute paths when absolute option is true", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    const files = await findFiles(["**/*.ts"], {
      cwd: testDir,
      mode: "watchman",
      absolute: true,
    });

    expect(files.length).toBe(3);
    files.forEach((file) => {
      expect(path.isAbsolute(file)).toBe(true);
      expect(file.startsWith(testDir)).toBe(true);
    });
  });

  it("should only find directories when onlyDirectories is true", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    const files = await findFiles(["**/*"], {
      cwd: testDir,
      mode: "watchman",
      onlyDirectories: true,
      onlyFiles: false,
    });

    expect(files.length).toBe(2); // src and src/components
    expect(files).toContain("src");
    expect(files).toContain("src/components");
  });

  it("should only find files when onlyFiles is true", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    const files = await findFiles(["**/*"], {
      cwd: testDir,
      mode: "watchman",
      onlyFiles: true,
    });

    // Should find 5 files: README.md, package.json, index.ts, button.ts, card.ts
    expect(files.length).toBe(5);
    expect(files).not.toContain("src");
    expect(files).not.toContain("src/components");
  });

  it("should find dot files when dot option is true", async () => {
    await createFiles(
      testDir,
      `
      ├─ .gitignore
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ .hidden.ts
            └─ card.ts
    `,
    );

    const filesWithoutDot = await findFiles(["**/*.ts"], {
      cwd: testDir,
      mode: "watchman",
      dot: false, // default
    });

    expect(filesWithoutDot.length).toBe(2);
    expect(filesWithoutDot).toContain("src/index.ts");
    expect(filesWithoutDot).toContain("src/components/card.ts");
    expect(filesWithoutDot).not.toContain("src/components/.hidden.ts");

    const filesWithDot = await findFiles(["**/*.ts"], {
      cwd: testDir,
      mode: "watchman",
      dot: true,
    });

    expect(filesWithDot.length).toBe(3);
    expect(filesWithDot).toContain("src/index.ts");
    expect(filesWithDot).toContain("src/components/card.ts");
    expect(filesWithDot).toContain("src/components/.hidden.ts");
  });

  it("should watch for file changes", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    let callbackCalled = false;
    let initialFileCount = 0;
    let fileChanges = {
      added: new Map(),
      changed: new Map(),
      deleted: new Map(),
    };

    // Start watching
    const destroy = await watch(
      "**/*.ts",
      (changes) => {
        callbackCalled = true;

        // Store the initial number of files
        if (initialFileCount === 0) {
          initialFileCount = changes.added.size;
        }

        // Store changes for assertion
        changes.added.forEach((value, key) => {
          fileChanges.added.set(key, value);
        });
        changes.changed.forEach((value, key) => {
          fileChanges.changed.set(key, value);
        });
        changes.deleted.forEach((value, key) => {
          fileChanges.deleted.set(key, value);
        });
      },
      {
        cwd: testDir,
        mode: "watchman",
      },
    );

    // Initial scan should have triggered the callback
    expect(callbackCalled).toBe(true);
    expect(initialFileCount).toBe(3);

    // Clean up
    destroy();
  });

  it("should include requested fields in FileInfo objects", async () => {
    await createFiles(
      testDir,
      `
      ├─ README.md
      ├─ package.json
      └─ src
         ├─ index.ts
         └─ components
            ├─ button.ts
            └─ card.ts
    `,
    );

    let fileInfoObjects = new Map();

    const destroy = await watch(
      "**/*.ts",
      (changes) => {
        fileInfoObjects = changes.added;
      },
      {
        cwd: testDir,
        mode: "watchman",
        fields: ["type", "size", "mtime"],
      },
    );

    // Check that all FileInfo objects have the requested fields
    fileInfoObjects.forEach((fileInfo) => {
      expect(fileInfo).toHaveProperty("name");
      expect(fileInfo).toHaveProperty("path");
      expect(fileInfo).toHaveProperty("type");
      // Other fields depend on the watchman capabilities
    });

    destroy();
  });

  it("should detect new files after watching starts", async () => {
    await createFiles(
      testDir,
      `
         ├─ README.md
         ├─ package.json
         └─ src
            ├─ index.ts
            └─ components
               └─ button.ts
       `,
    );

    const changes = createCallTracker<[FileChanges]>();

    // Start watching
    const destroy = await watch("**/*.ts", changes, {
      cwd: testDir,
      mode: "watchman",
    });

    const [{ added: initalAdded }] = await changes.latest();
    expect([...initalAdded.keys()]).toEqual([
      "src/index.ts",
      "src/components/button.ts",
    ]);

    changes.reset();
    const newFilePath = path.join("src", "components", "new-file.ts");
    fs.writeFileSync(
      path.resolve(testDir, newFilePath),
      "export const newComponent = () => {};",
    );
    while (true) {
      const [{ added }] = await changes.next();
      const addedFiles = [...added.keys()];
      if (addedFiles.includes(newFilePath)) {
        expect([...added.keys()]).toEqual(["src/components/new-file.ts"]);
        break;
      }
    }

    destroy();
  });
});
