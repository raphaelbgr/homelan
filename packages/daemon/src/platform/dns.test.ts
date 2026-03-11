/**
 * DnsConfigurator unit tests — mock executor, no real OS calls.
 * Platform is injected via options for cross-platform branch testing.
 */
import { describe, it, expect, vi } from "vitest";
import { createDnsConfigurator } from "./dns.js";
import type { ShellExecutor } from "../utils/execFile.js";

function makeExecutor(): ShellExecutor {
  return vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
}

describe("DnsConfigurator", () => {
  it("Test 1: setDns on win32 calls netsh with correct static DNS args", async () => {
    const executor = makeExecutor();
    const dns = createDnsConfigurator({ executor, platform: "win32" });

    await dns.setDns("homelan", "192.168.7.1");

    expect(executor).toHaveBeenCalledWith("netsh", [
      "interface",
      "ip",
      "set",
      "dns",
      "homelan",
      "static",
      "192.168.7.1",
    ]);
  });

  it("Test 2: restoreDns on win32 calls netsh with dhcp args", async () => {
    const executor = makeExecutor();
    const dns = createDnsConfigurator({ executor, platform: "win32" });

    await dns.restoreDns("homelan");

    expect(executor).toHaveBeenCalledWith("netsh", [
      "interface",
      "ip",
      "set",
      "dns",
      "homelan",
      "dhcp",
    ]);
  });

  it("Test 3: setDns on darwin calls networksetup with -setdnsservers", async () => {
    const executor = makeExecutor();
    const dns = createDnsConfigurator({ executor, platform: "darwin" });

    await dns.setDns("Wi-Fi", "192.168.7.1");

    expect(executor).toHaveBeenCalledWith("networksetup", [
      "-setdnsservers",
      "Wi-Fi",
      "192.168.7.1",
    ]);
  });
});
