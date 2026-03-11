/**
 * Tests for ARP table parser module.
 * Uses injectable executors (mock ShellExecutor) to avoid spawning real processes.
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseArpTable,
  inferDeviceType,
  resolveHostname,
  scanLanDevices,
} from "./arp.js";

// ---------------------------------------------------------------------------
// parseArpTable — Windows format
// ---------------------------------------------------------------------------

const WINDOWS_ARP_SAMPLE = `
Interface: 192.168.7.101 --- 0x5
  Internet Address      Physical Address      Type
  192.168.7.1           00-11-22-33-44-55     dynamic
  192.168.7.102         aa-bb-cc-dd-ee-ff     dynamic
  192.168.7.152         11-22-33-44-55-66     dynamic
  192.168.7.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static
`;

describe("parseArpTable — Windows", () => {
  it("parses valid IP entries from Windows arp -a output", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    expect(devices.length).toBeGreaterThanOrEqual(2);
    const ips = devices.map((d) => d.ip);
    expect(ips).toContain("192.168.7.102");
    expect(ips).toContain("192.168.7.152");
  });

  it("filters out gateway .1 entry", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    const ips = devices.map((d) => d.ip);
    expect(ips).not.toContain("192.168.7.1");
  });

  it("filters out broadcast .255 entry", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    const ips = devices.map((d) => d.ip);
    expect(ips).not.toContain("192.168.7.255");
  });

  it("filters out multicast entries (ff-ff-ff-ff-ff-ff MAC)", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    const ips = devices.map((d) => d.ip);
    // 224.x.x.x multicast should be filtered (broadcast MAC)
    expect(ips).not.toContain("224.0.0.22");
  });

  it("sets hostname to null for Windows entries (no hostname in arp -a)", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    for (const d of devices) {
      expect(d.hostname).toBeNull();
    }
  });

  it("sets deviceType to null (not yet inferred at parse time)", () => {
    const devices = parseArpTable(WINDOWS_ARP_SAMPLE, "win32");
    for (const d of devices) {
      expect(d.deviceType).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// parseArpTable — macOS format
// ---------------------------------------------------------------------------

const MACOS_ARP_SAMPLE = `
mac-mini.local (192.168.7.102) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
Amazon-FireTV-123.local (192.168.7.152) at 11:22:33:44:55:66 on en0 ifscope [ethernet]
? (192.168.7.1) at 00:11:22:33:44:55 on en0 ifscope [ethernet]
? (192.168.7.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]
? (192.168.7.50) at (incomplete) on en0 ifscope [ethernet]
`;

describe("parseArpTable — macOS", () => {
  it("parses valid IP+hostname entries from macOS arp -a output", () => {
    const devices = parseArpTable(MACOS_ARP_SAMPLE, "darwin");
    expect(devices.length).toBeGreaterThanOrEqual(2);
    const ips = devices.map((d) => d.ip);
    expect(ips).toContain("192.168.7.102");
    expect(ips).toContain("192.168.7.152");
  });

  it("extracts hostname for named entries", () => {
    const devices = parseArpTable(MACOS_ARP_SAMPLE, "darwin");
    const mini = devices.find((d) => d.ip === "192.168.7.102");
    expect(mini?.hostname).toBe("mac-mini.local");
    const tv = devices.find((d) => d.ip === "192.168.7.152");
    expect(tv?.hostname).toBe("Amazon-FireTV-123.local");
  });

  it("filters out gateway .1 entry", () => {
    const devices = parseArpTable(MACOS_ARP_SAMPLE, "darwin");
    const ips = devices.map((d) => d.ip);
    expect(ips).not.toContain("192.168.7.1");
  });

  it("filters out broadcast .255 entry", () => {
    const devices = parseArpTable(MACOS_ARP_SAMPLE, "darwin");
    const ips = devices.map((d) => d.ip);
    expect(ips).not.toContain("192.168.7.255");
  });

  it("filters out incomplete entries", () => {
    const devices = parseArpTable(MACOS_ARP_SAMPLE, "darwin");
    const ips = devices.map((d) => d.ip);
    expect(ips).not.toContain("192.168.7.50");
  });
});

// ---------------------------------------------------------------------------
// inferDeviceType
// ---------------------------------------------------------------------------

describe("inferDeviceType", () => {
  it("returns null for null hostname", () => {
    expect(inferDeviceType(null)).toBeNull();
  });

  it("returns Fire TV for hostnames containing 'fire'", () => {
    expect(inferDeviceType("Amazon-FireTV-123.local")).toBe("Fire TV");
  });

  it("returns Fire TV for hostnames containing 'amazon'", () => {
    expect(inferDeviceType("amazon-device.local")).toBe("Fire TV");
  });

  it("returns Mac Mini for hostnames containing 'mac-mini'", () => {
    expect(inferDeviceType("mac-mini.local")).toBe("Mac Mini");
  });

  it("returns Mac Mini for hostnames containing 'mini'", () => {
    expect(inferDeviceType("my-mini-server.local")).toBe("Mac Mini");
  });

  it("returns Windows PC for hostnames containing 'desktop'", () => {
    expect(inferDeviceType("DESKTOP-ABC123")).toBe("Windows PC");
  });

  it("returns iPhone for hostnames containing 'iphone'", () => {
    expect(inferDeviceType("Raphaels-iPhone.local")).toBe("iPhone");
  });

  it("returns iPad for hostnames containing 'ipad'", () => {
    expect(inferDeviceType("My-iPad.local")).toBe("iPad");
  });

  it("returns Android Device for hostnames containing 'android'", () => {
    expect(inferDeviceType("android-device.local")).toBe("Android Device");
  });

  it("returns null for unknown hostnames", () => {
    expect(inferDeviceType("unknown-device.local")).toBeNull();
    expect(inferDeviceType("printer.lan")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveHostname
// ---------------------------------------------------------------------------

describe("resolveHostname", () => {
  it("returns hostname from nslookup Name: line", async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: "Server:  192.168.7.1\nAddress:  192.168.7.1#53\n\nName:    mac-mini.local\nAddress: 192.168.7.102",
      stderr: "",
    });
    const result = await resolveHostname("192.168.7.102", mockExecutor);
    expect(result).toBe("mac-mini.local");
    expect(mockExecutor).toHaveBeenCalledWith("nslookup", ["192.168.7.102"]);
  });

  it("strips trailing dot from hostname", async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: "Name:    mac-mini.local.\nAddress: 192.168.7.102",
      stderr: "",
    });
    const result = await resolveHostname("192.168.7.102", mockExecutor);
    expect(result).toBe("mac-mini.local");
  });

  it("returns null when nslookup has no Name: line", async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: "** server can't find 192.168.7.200: NXDOMAIN",
      stderr: "",
    });
    const result = await resolveHostname("192.168.7.200", mockExecutor);
    expect(result).toBeNull();
  });

  it("returns null when executor throws", async () => {
    const mockExecutor = vi.fn().mockRejectedValue(new Error("command failed"));
    const result = await resolveHostname("192.168.7.200", mockExecutor);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scanLanDevices
// ---------------------------------------------------------------------------

describe("scanLanDevices", () => {
  it("returns enriched LanDevice[] with hostname and deviceType from macOS arp output", async () => {
    const mockExecutor = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "arp" && args[0] === "-a") {
        return Promise.resolve({
          stdout: "mac-mini.local (192.168.7.102) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]\nAmazon-FireTV-123.local (192.168.7.152) at 11:22:33:44:55:66 on en0 ifscope [ethernet]",
          stderr: "",
        });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const devices = await scanLanDevices(mockExecutor, "darwin");
    expect(devices.length).toBe(2);

    const mini = devices.find((d) => d.ip === "192.168.7.102");
    expect(mini?.hostname).toBe("mac-mini.local");
    expect(mini?.deviceType).toBe("Mac Mini");

    const tv = devices.find((d) => d.ip === "192.168.7.152");
    expect(tv?.hostname).toBe("Amazon-FireTV-123.local");
    expect(tv?.deviceType).toBe("Fire TV");
  });

  it("resolves hostnames via nslookup for Windows entries with null hostname", async () => {
    const mockExecutor = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "arp" && args[0] === "-a") {
        return Promise.resolve({
          stdout: "  192.168.7.102         aa-bb-cc-dd-ee-ff     dynamic\n  192.168.7.152         11-22-33-44-55-66     dynamic",
          stderr: "",
        });
      }
      if (cmd === "nslookup") {
        const ip = args[0];
        if (ip === "192.168.7.102") {
          return Promise.resolve({
            stdout: "Name:    mac-mini.local\nAddress: 192.168.7.102",
            stderr: "",
          });
        }
        if (ip === "192.168.7.152") {
          return Promise.resolve({
            stdout: "Name:    Amazon-FireTV-123.local\nAddress: 192.168.7.152",
            stderr: "",
          });
        }
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const devices = await scanLanDevices(mockExecutor, "win32");
    expect(devices.length).toBe(2);

    const mini = devices.find((d) => d.ip === "192.168.7.102");
    expect(mini?.hostname).toBe("mac-mini.local");
    expect(mini?.deviceType).toBe("Mac Mini");
  });

  it("returns empty array when arp executor throws", async () => {
    const mockExecutor = vi.fn().mockRejectedValue(new Error("arp not found"));
    const devices = await scanLanDevices(mockExecutor, "win32");
    expect(devices).toEqual([]);
  });

  it("returns devices with null hostname when nslookup fails", async () => {
    const mockExecutor = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "arp" && args[0] === "-a") {
        return Promise.resolve({
          stdout: "  192.168.7.102         aa-bb-cc-dd-ee-ff     dynamic",
          stderr: "",
        });
      }
      // nslookup fails
      return Promise.reject(new Error("nslookup failed"));
    });

    const devices = await scanLanDevices(mockExecutor, "win32");
    expect(devices.length).toBe(1);
    expect(devices[0]?.hostname).toBeNull();
    expect(devices[0]?.deviceType).toBeNull();
  });
});
