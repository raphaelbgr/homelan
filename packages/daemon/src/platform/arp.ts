/**
 * ARP table parser module for LAN device discovery.
 *
 * Provides parseArpTable, inferDeviceType, resolveHostname, and scanLanDevices.
 * All shell calls use injectable ShellExecutor for testability.
 */
import type { LanDevice } from "@homelan/shared";
import { execFileSafe, type ShellExecutor } from "../utils/execFile.js";

// ---------------------------------------------------------------------------
// Windows ARP parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single Windows `arp -a` output line.
 * Format: "  192.168.7.102          aa-bb-cc-dd-ee-ff     dynamic"
 */
function parseWindowsArpLine(line: string): { ip: string; mac: string } | null {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const ip = parts[0];
  const mac = parts[1];
  if (!ip || !mac) return null;
  if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/)) return null;
  // Filter broadcast MAC
  if (mac === "ff-ff-ff-ff-ff-ff") return null;
  // Must be a valid MAC (xx-xx-xx-xx-xx-xx format)
  if (!mac.match(/^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/i)) return null;
  return { ip, mac };
}

// ---------------------------------------------------------------------------
// macOS ARP parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single macOS `arp -a` output line.
 * Format: "mac-mini.local (192.168.7.102) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]"
 * Incomplete format: "? (192.168.7.50) at (incomplete) on en0 ifscope [ethernet]"
 */
function parseMacArpLine(line: string): { ip: string; hostname: string | null } | null {
  const match = line.match(/^(\S+)\s+\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+(\S+)/);
  if (!match) return null;
  const [, hostPart, ip, mac] = match;
  // Filter incomplete entries
  if (mac === "(incomplete)") return null;
  // hostname: use hostPart unless it's "?" (unknown host)
  const hostname = hostPart && hostPart !== "?" ? hostPart : null;
  return { ip: ip!, hostname };
}

// ---------------------------------------------------------------------------
// IP filtering helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the IP should be excluded from device discovery:
 * - Gateway IPs ending in .1
 * - Broadcast IPs ending in .255
 * - Multicast IPs in range 224.0.0.0/4 (224.x.x.x to 239.x.x.x)
 */
function isFilteredIp(ip: string): boolean {
  if (ip.endsWith(".1") || ip.endsWith(".255")) return true;
  // Multicast range: first octet 224-239
  const firstOctet = parseInt(ip.split(".")[0] ?? "0", 10);
  if (firstOctet >= 224 && firstOctet <= 239) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse `arp -a` stdout into LanDevice[].
 * Filters out gateways (.1), broadcasts (.255), and incomplete entries.
 * On Windows: hostname is always null (arp -a doesn't include hostnames).
 * On macOS/linux: hostname extracted from output when available.
 */
export function parseArpTable(output: string, platform: NodeJS.Platform = process.platform): LanDevice[] {
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
  const devices: LanDevice[] = [];

  for (const line of lines) {
    if (platform === "win32") {
      const parsed = parseWindowsArpLine(line);
      if (!parsed) continue;
      // Filter gateway, broadcast, and multicast IPs
      if (isFilteredIp(parsed.ip)) continue;
      devices.push({ ip: parsed.ip, hostname: null, deviceType: null });
    } else {
      // darwin / linux
      const parsed = parseMacArpLine(line);
      if (!parsed) continue;
      // Filter gateway, broadcast, and multicast IPs
      if (isFilteredIp(parsed.ip)) continue;
      devices.push({ ip: parsed.ip, hostname: parsed.hostname, deviceType: null });
    }
  }

  return devices;
}

/**
 * Infer device type from hostname using heuristic matching.
 * Returns null if no match found.
 */
export function inferDeviceType(hostname: string | null): string | null {
  if (!hostname) return null;
  const h = hostname.toLowerCase();
  if (h.includes("fire") || h.includes("amazon")) return "Fire TV";
  if (h.includes("mac-mini") || h.includes("macmini") || h.includes("mini")) return "Mac Mini";
  if (h.includes("macbook")) return "MacBook";
  if (h.includes("iphone")) return "iPhone";
  if (h.includes("ipad")) return "iPad";
  if (h.includes("mac")) return "MacBook";
  if (h.includes("desktop") || h.includes("windows") || h.includes("pc")) return "Windows PC";
  if (h.includes("android")) return "Android Device";
  return null;
}

/**
 * Attempt reverse DNS lookup for an IP address using nslookup.
 * Returns hostname string on success, null on failure.
 */
export async function resolveHostname(ip: string, executor: ShellExecutor = execFileSafe): Promise<string | null> {
  try {
    const { stdout } = await executor("nslookup", [ip]);
    // nslookup output format: "Name:    hostname" on success
    const nameMatch = stdout.match(/Name:\s+(\S+)/i);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].replace(/\.$/, ""); // strip trailing dot
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scan LAN devices via `arp -a`, enrich with hostnames (nslookup for Windows)
 * and infer device types from hostnames.
 *
 * Returns empty array on any arp failure.
 */
export async function scanLanDevices(
  executor: ShellExecutor = execFileSafe,
  platform: NodeJS.Platform = process.platform
): Promise<LanDevice[]> {
  try {
    const { stdout } = await executor("arp", ["-a"]);
    const devices = parseArpTable(stdout, platform);

    // Enrich with hostnames and device types
    const enriched = await Promise.all(
      devices.map(async (device) => {
        let hostname = device.hostname;
        // Windows entries have null hostname — try nslookup
        if (!hostname) {
          hostname = await resolveHostname(device.ip, executor);
        }
        const deviceType = inferDeviceType(hostname);
        return { ...device, hostname, deviceType };
      })
    );

    return enriched;
  } catch {
    return [];
  }
}
