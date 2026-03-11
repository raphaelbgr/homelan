import { execFileSafe, type ShellExecutor } from "../utils/execFile.js";

/**
 * Platform IPv6 blocker — disables and restores IPv6 on a named network
 * interface to prevent IPv6 leak when the tunnel is active.
 *
 * - Windows: netsh interface ipv6 set interface advertise=disabled/enabled
 * - macOS:   networksetup -setv6off / -setv6automatic
 */
export interface IPv6Blocker {
  blockIPv6(interfaceName: string): Promise<void>;
  restoreIPv6(interfaceName: string): Promise<void>;
}

export function createIPv6Blocker(opts?: {
  executor?: ShellExecutor;
  platform?: NodeJS.Platform;
}): IPv6Blocker {
  const executor = opts?.executor ?? execFileSafe;
  const platform = opts?.platform ?? (process.platform as NodeJS.Platform);

  return {
    async blockIPv6(interfaceName: string): Promise<void> {
      console.warn("[ipv6] IPv6 disabled on tunnel interface");
      if (platform === "win32") {
        await executor("netsh", [
          "interface",
          "ipv6",
          "set",
          "interface",
          interfaceName,
          "advertise=disabled",
        ]);
      } else {
        // macOS / darwin
        await executor("networksetup", ["-setv6off", interfaceName]);
      }
    },

    async restoreIPv6(interfaceName: string): Promise<void> {
      if (platform === "win32") {
        await executor("netsh", [
          "interface",
          "ipv6",
          "set",
          "interface",
          interfaceName,
          "advertise=enabled",
        ]);
      } else {
        // macOS / darwin
        await executor("networksetup", ["-setv6automatic", interfaceName]);
      }
    },
  };
}
