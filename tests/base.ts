import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { watch, findFiles, FileChanges } from "../src/index";
import {
  createTestDir,
  createFiles,
  cleanupDir,
  createCallTracker,
} from "./utils";
import path from "path";

type WatcherMode = "native" | "watchman";

/**
 * Creates a standardized test suite for a watcher implementation
 *
 * @param mode - The watcher mode to test
 */
export function createWatcherTests(mode: WatcherMode) {
  describe(`${mode} watcher`, () => {
    let testDir: string;

    beforeEach(() => {
      testDir = createTestDir(`${mode}-test`);
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
        mode,
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
        mode,
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
        mode,
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
        mode,
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
        mode,
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
        mode,
        dot: false, // default
      });

      expect(filesWithoutDot.length).toBe(2);
      expect(filesWithoutDot).toContain("src/index.ts");
      expect(filesWithoutDot).toContain("src/components/card.ts");
      expect(filesWithoutDot).not.toContain("src/components/.hidden.ts");

      const filesWithDot = await findFiles(["**/*.ts"], {
        cwd: testDir,
        mode,
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

      const changes = createCallTracker<[FileChanges]>();

      // Start watching
      const destroy = await watch("**/*.ts", changes, {
        cwd: testDir,
        mode,
      });

      const [{ added }] = await changes.latest();
      expect(added.size).toBe(3);

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

      const changes = createCallTracker<[FileChanges]>();

      const destroy = await watch("**/*.ts", changes, {
        cwd: testDir,
        mode,
        fields: ["type", "size", "mtime"],
      });

      const [{ added }] = await changes.latest();

      // Check that all FileInfo objects have the requested fields
      added.forEach((fileInfo) => {
        expect(fileInfo).toHaveProperty("name");
        expect(fileInfo).toHaveProperty("path");
        expect(fileInfo).toHaveProperty("type");
        // Other fields depend on the watcher capabilities
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
        mode,
      });

      // Wait for initial watch to complete
      const [{ added: initialAdded }] = await changes.latest();
      expect([...initialAdded.keys()].sort()).toEqual([
        "src/components/button.ts",
        "src/index.ts",
      ]);

      changes.reset();

      // Add a new file
      await createFiles(
        testDir,
        `
        └─ src
           └─ components
              └─ new-file.ts
      `,
      );

      // Wait for the change to be detected
      const [{ added }] = await changes.latest();
      expect([...added.keys()]).toEqual(["src/components/new-file.ts"]);

      destroy();
    });

    it("should detect file deletions", async () => {
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

      const changes = createCallTracker<[FileChanges]>();

      // Start watching
      const destroy = await watch("**/*.ts", changes, {
        cwd: testDir,
        mode,
      });

      // Wait for initial watch to complete
      await changes.latest();
      changes.reset();

      // Delete a file
      const fileToDelete = path.join(testDir, "src", "components", "card.ts");
      await new Promise<void>((resolve) => {
        require("fs").unlink(fileToDelete, () => resolve());
      });

      // Wait for the deletion to be detected
      const [{ deleted }] = await changes.latest();
      expect([...deleted.keys()]).toEqual(["src/components/card.ts"]);

      destroy();
    });

    it("should allow to ignore files with ignore pattern", async () => {
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
        mode,
        ignore: ["**/new-file.demo.ts"],
      });

      // Wait for initial watch to complete
      await changes.latest();
      changes.reset();

      await createFiles(
        testDir,
        `
        └─ src
           └─ components
              ├─ new.ts
              └─ new-file.demo.ts
      `,
      );

      // Wait for the change to be detected
      const [fileChanges] = await changes.latest();

      expect(fileChanges.added.has("src/components/new.ts")).toBe(true);
      expect(fileChanges.added.has("src/components/new-file.demo.ts")).toBe(
        false,
      );

      destroy();
    });
  });
}
