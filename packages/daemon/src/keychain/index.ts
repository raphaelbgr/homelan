import { WindowsKeychain } from "./windows.js";
import { MacosKeychain } from "./macos.js";
import { FileKeystore } from "./filestore.js";

export interface KeychainStore {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export function getKeychain(): KeychainStore {
  if (process.platform === "win32") return new WindowsKeychain();
  if (process.platform === "darwin") return new MacosKeychain();
  console.warn(
    "[keychain] No native keychain — falling back to file store. Not recommended for production."
  );
  return new FileKeystore();
}

export { WindowsKeychain, MacosKeychain, FileKeystore };
