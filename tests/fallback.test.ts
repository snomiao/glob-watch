import { vi } from "vitest";
import { createWatcherTests } from "./base";

// Mock fb-watchman to simulate it not being available
vi.mock("fb-watchman", () => {
  return { default: null };
});

vi.mock("../src/errors.ts", () => {
  return {
    logError: vi.fn(),
  };
});

// Run the base test suite for fallback watcher
// Since it falls back to native when watchman is unavailable, we can use "watchman" mode
// which will internally fall back to native
createWatcherTests("watchman");
