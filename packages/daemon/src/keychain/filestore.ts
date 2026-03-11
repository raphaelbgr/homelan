import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KeychainStore } from "./index.js";

type KeyStore = Record<string, string>;

/**
 * Fallback keychain that stores credentials in ~/.homelan/keys.json.
 * Used as a CI-safe backend in tests and as a production fallback on Linux.
 * Accepts an optional custom directory for testing isolation.
 */
export class FileKeystore implements KeychainStore {
  private readonly filePath: string;

  constructor(dir?: string) {
    const base = dir ?? join(homedir(), ".homelan");
    this.filePath = join(base, "keys.json");
  }

  async store(key: string, value: string): Promise<void> {
    const existing = await this.readAll();
    existing[key] = value;
    await this.writeAll(existing);
  }

  async retrieve(key: string): Promise<string | null> {
    const existing = await this.readAll();
    return existing[key] ?? null;
  }

  async delete(key: string): Promise<void> {
    const existing = await this.readAll();
    delete existing[key];
    await this.writeAll(existing);
  }

  private async readAll(): Promise<KeyStore> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as KeyStore;
    } catch {
      return {};
    }
  }

  private async writeAll(data: KeyStore): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), {
      mode: 0o600,
      encoding: "utf8",
    });
  }
}
