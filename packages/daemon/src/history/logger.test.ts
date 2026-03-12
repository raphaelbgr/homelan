import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HistoryLogger } from "./logger.js";
import type { HistoryEntry } from "./logger.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeTmpPath(): string {
  return path.join(
    os.tmpdir(),
    `homelan-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
}

describe("HistoryLogger", () => {
  let tmpPath: string;
  let logger: HistoryLogger;

  beforeEach(() => {
    tmpPath = makeTmpPath();
    logger = new HistoryLogger(tmpPath);
  });

  afterEach(() => {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // May not exist
    }
  });

  describe("append()", () => {
    it("creates the file on first append", () => {
      expect(fs.existsSync(tmpPath)).toBe(false);
      const entry: HistoryEntry = {
        timestamp: new Date().toISOString(),
        action: "connect",
        mode: "lan-only",
        peer_endpoint: "1.2.3.4:51820",
        fallback_method: "direct",
      };
      logger.append(entry);
      expect(fs.existsSync(tmpPath)).toBe(true);
    });

    it("writes valid JSON Lines on each append", () => {
      const entry1: HistoryEntry = {
        timestamp: "2026-01-01T00:00:00.000Z",
        action: "connect",
        mode: "lan-only",
      };
      const entry2: HistoryEntry = {
        timestamp: "2026-01-01T00:01:00.000Z",
        action: "disconnect",
        mode: "lan-only",
        duration_ms: 60000,
      };

      logger.append(entry1);
      logger.append(entry2);

      const lines = fs.readFileSync(tmpPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!)).toEqual(entry1);
      expect(JSON.parse(lines[1]!)).toEqual(entry2);
    });

    it("appends without overwriting existing entries", () => {
      for (let i = 0; i < 5; i++) {
        logger.append({ timestamp: new Date().toISOString(), action: "connect" });
      }
      const lines = fs.readFileSync(tmpPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(5);
    });
  });

  describe("getEntries()", () => {
    it("returns empty array when file does not exist", () => {
      const entries = logger.getEntries();
      expect(entries).toEqual([]);
    });

    it("returns all entries when count is within limit", () => {
      const entries: HistoryEntry[] = [
        { timestamp: "2026-01-01T00:00:00.000Z", action: "connect" },
        { timestamp: "2026-01-01T00:01:00.000Z", action: "disconnect", duration_ms: 60000 },
        { timestamp: "2026-01-01T00:02:00.000Z", action: "error", error: "timeout" },
      ];
      for (const e of entries) logger.append(e);

      const result = logger.getEntries(10);
      expect(result).toHaveLength(3);
    });

    it("returns last N entries when limit is smaller than total", () => {
      for (let i = 0; i < 10; i++) {
        logger.append({ timestamp: `2026-01-01T00:0${i}:00.000Z`, action: "connect" });
      }
      const result = logger.getEntries(3);
      expect(result).toHaveLength(3);
      // Should be the last 3
      expect(result[0]!.timestamp).toBe("2026-01-01T00:07:00.000Z");
      expect(result[1]!.timestamp).toBe("2026-01-01T00:08:00.000Z");
      expect(result[2]!.timestamp).toBe("2026-01-01T00:09:00.000Z");
    });

    it("defaults to 20 entries when no limit provided", () => {
      for (let i = 0; i < 25; i++) {
        logger.append({ timestamp: new Date().toISOString(), action: "connect" });
      }
      const result = logger.getEntries();
      expect(result).toHaveLength(20);
    });
  });

  describe("1000-entry cap", () => {
    it("trims file to 1000 entries when exceeds cap", () => {
      // Write 1001 entries
      for (let i = 0; i < 1001; i++) {
        logger.append({ timestamp: `2026-01-01T${String(Math.floor(i / 3600)).padStart(2, "0")}:00:00.000Z`, action: "connect" });
      }

      const lines = fs.readFileSync(tmpPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1000);
    });
  });

  describe("custom file path", () => {
    it("writes to specified file path", () => {
      const customPath = makeTmpPath();
      const customLogger = new HistoryLogger(customPath);
      customLogger.append({ timestamp: new Date().toISOString(), action: "connect" });
      expect(fs.existsSync(customPath)).toBe(true);
      try { fs.unlinkSync(customPath); } catch { /* ignore */ }
    });
  });
});
