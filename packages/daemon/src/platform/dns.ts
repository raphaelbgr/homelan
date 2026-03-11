import { execFileSafe, type ShellExecutor } from "../utils/execFile.js";

/**
 * Platform DNS configurator — sets and restores the DNS resolver
 * on a named network interface using OS-specific commands.
 *
 * - Windows: netsh interface ip set dns
 * - macOS:   networksetup -setdnsservers / -setdnsservers "empty"
 */
export interface DnsConfigurator {
  setDns(interfaceName: string, dnsServer: string): Promise<void>;
  restoreDns(interfaceName: string): Promise<void>;
}

export function createDnsConfigurator(opts?: {
  executor?: ShellExecutor;
  platform?: NodeJS.Platform;
}): DnsConfigurator {
  const executor = opts?.executor ?? execFileSafe;
  const platform = opts?.platform ?? (process.platform as NodeJS.Platform);

  return {
    async setDns(interfaceName: string, dnsServer: string): Promise<void> {
      if (platform === "win32") {
        await executor("netsh", [
          "interface",
          "ip",
          "set",
          "dns",
          interfaceName,
          "static",
          dnsServer,
        ]);
      } else {
        // macOS / darwin
        await executor("networksetup", [
          "-setdnsservers",
          interfaceName,
          dnsServer,
        ]);
      }
    },

    async restoreDns(interfaceName: string): Promise<void> {
      if (platform === "win32") {
        await executor("netsh", [
          "interface",
          "ip",
          "set",
          "dns",
          interfaceName,
          "dhcp",
        ]);
      } else {
        // macOS / darwin — "empty" clears DNS servers back to automatic
        await executor("networksetup", [
          "-setdnsservers",
          interfaceName,
          "empty",
        ]);
      }
    },
  };
}
