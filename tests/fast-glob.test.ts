import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { watch, findFiles } from "../src/index";
import { createTestDir, createFiles, cleanupDir } from "./utils";
import path from "path";

describe("Fast-glob watcher", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir("fast-glob-test");
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
      mode: "fast-glob",
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
      mode: "fast-glob",
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
      mode: "fast-glob",
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
      mode: "fast-glob",
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
      mode: "fast-glob",
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
      mode: "fast-glob",
      dot: false, // default
    });

    expect(filesWithoutDot.length).toBe(2);
    expect(filesWithoutDot).toContain("src/index.ts");
    expect(filesWithoutDot).toContain("src/components/card.ts");
    expect(filesWithoutDot).not.toContain("src/components/.hidden.ts");

    const filesWithDot = await findFiles(["**/*.ts"], {
      cwd: testDir,
      mode: "fast-glob",
      dot: true,
    });

    expect(filesWithDot.length).toBe(3);
    expect(filesWithDot).toContain("src/index.ts");
    expect(filesWithDot).toContain("src/components/card.ts");
    expect(filesWithDot).toContain("src/components/.hidden.ts");
  });

  it("should perform one-time scan with watch", async () => {
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
    let addedFiles = new Map();

    const destroy = await watch(
      "**/*.ts",
      (changes) => {
        callbackCalled = true;
        addedFiles = changes.added;
      },
      {
        cwd: testDir,
        mode: "fast-glob",
      },
    );

    // Callback should have been called
    expect(callbackCalled).toBe(true);
    expect(addedFiles.size).toBe(3);

    // Files should match expected paths
    const filePaths = Array.from(addedFiles.keys());
    expect(filePaths).toContain("src/index.ts");
    expect(filePaths).toContain("src/components/button.ts");
    expect(filePaths).toContain("src/components/card.ts");

    // FileInfo objects should contain expected properties
    addedFiles.forEach((fileInfo) => {
      expect(fileInfo).toHaveProperty("name");
      expect(fileInfo).toHaveProperty("path");
      expect(fileInfo).toHaveProperty("exists", true);
    });

    // destroy should be a no-op for fast-glob mode as it's a one-time operation
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

    await watch(
      "**/*.ts",
      (changes) => {
        fileInfoObjects = changes.added;
      },
      {
        cwd: testDir,
        mode: "fast-glob",
        fields: ["type", "size", "mtime"],
      },
    );

    // Check that all requested fields are present in the FileInfo objects
    fileInfoObjects.forEach((fileInfo) => {
      expect(fileInfo).toHaveProperty("type");
      expect(fileInfo).toHaveProperty("size");
      expect(fileInfo).toHaveProperty("mtime");
      expect(fileInfo).toHaveProperty("name");
      expect(fileInfo).toHaveProperty("path");
    });
  });
});
