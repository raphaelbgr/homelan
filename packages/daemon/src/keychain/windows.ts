import { execFileSafe } from "../utils/execFile.js";
import type { KeychainStore } from "./index.js";

/**
 * Windows Credential Manager keychain backend.
 * Uses `cmdkey` for store/delete and PowerShell P/Invoke for retrieve.
 * All calls use execFileSafe (args as array — no shell injection).
 */
export class WindowsKeychain implements KeychainStore {
  private credName(key: string): string {
    return `homelan:${key}`;
  }

  async store(key: string, value: string): Promise<void> {
    await execFileSafe("cmdkey", [
      `/add:${this.credName(key)}`,
      "/user:homelan",
      `/pass:${value}`,
    ]);
  }

  async retrieve(key: string): Promise<string | null> {
    // Use PowerShell P/Invoke to read credential blob from Windows Credential Manager.
    // Args passed as array to execFileSafe — no shell injection.
    const psCommand = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
}
"@;
$ptr = [IntPtr]::Zero;
if ([WinCred]::CredRead('${this.credName(key)}', 1, 0, [ref]$ptr)) {
  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCred+CREDENTIAL]);
  $bytes = New-Object byte[] $cred.CredentialBlobSize;
  [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize);
  [WinCred]::CredFree($ptr);
  [System.Text.Encoding]::Unicode.GetString($bytes)
} else {
  Write-Output '__NOT_FOUND__'
}`.trim();

    try {
      const { stdout } = await execFileSafe("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psCommand,
      ]);
      const result = stdout.trim();
      if (result === "__NOT_FOUND__" || result === "") return null;
      return result;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await execFileSafe("cmdkey", [`/delete:${this.credName(key)}`]);
    } catch {
      // Ignore — credential may not exist
    }
  }
}
