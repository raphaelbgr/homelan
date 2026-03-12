import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { TunnelMode } from "@homelan/shared";

export interface HistoryEntry {
  timestamp: string; // ISO 8601
  action: "connect" | "disconnect" | "mode_switch" | "error";
  mode?: TunnelMode;
  duration_ms?: number;
  peer_endpoint?: string;
  fallback_method?: "direct" | "relay" | "ddns" | "hardcoded";
  error?: string;
}

const DEFAULT_HISTORY_PATH = path.join(os.homedir(), ".homelan", "history.jsonl");
const MAX_ENTRIES = 1000;

export class HistoryLogger {
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_HISTORY_PATH) {
    this.filePath = filePath;
    // Ensure parent directory exists
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Appends a HistoryEntry as a JSON Line to the history file.
   * If the file exceeds MAX_ENTRIES lines after append, trims to last MAX_ENTRIES.
   */
  append(entry: HistoryEntry): void {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.filePath, line, "utf-8");

    // Check and trim if over cap
    const content = fs.readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > MAX_ENTRIES) {
      const trimmed = lines.slice(lines.length - MAX_ENTRIES);
      fs.writeFileSync(this.filePath, trimmed.join("\n") + "\n", "utf-8");
    }
  }

  /**
   * Returns the last `limit` entries from the history file.
   * Returns [] if file does not exist.
   * Default limit is 20, maximum stored is 1000.
   */
  getEntries(limit: number = 20): HistoryEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const content = fs.readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    const start = Math.max(0, lines.length - limit);
    return lines.slice(start).map((line) => JSON.parse(line) as HistoryEntry);
  }
}
