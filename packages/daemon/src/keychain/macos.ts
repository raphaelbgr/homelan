import { execFileSafe } from "../utils/execFile.js";
import type { KeychainStore } from "./index.js";

/**
 * macOS Keychain backend using the `security` CLI.
 * All calls use execFileSafe (args as array — no shell injection).
 */
export class MacosKeychain implements KeychainStore {
  async store(key: string, value: string): Promise<void> {
    // -U flag: update if exists
    await execFileSafe("security", [
      "add-generic-password",
      "-s",
      "homelan",
      "-a",
      key,
      "-w",
      value,
      "-U",
    ]);
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileSafe("security", [
        "find-generic-password",
        "-s",
        "homelan",
        "-a",
        key,
        "-w",
      ]);
      const result = stdout.trim();
      return result === "" ? null : result;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await execFileSafe("security", [
        "delete-generic-password",
        "-s",
        "homelan",
        "-a",
        key,
      ]);
    } catch {
      // Ignore — credential may not exist
    }
  }
}
