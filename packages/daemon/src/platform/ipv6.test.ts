/**
 * IPv6Blocker unit tests — mock executor, no real OS calls.
 * Platform is injected via options for cross-platform branch testing.
 */
import { describe, it, expect, vi } from "vitest";
import { createIPv6Blocker } from "./ipv6.js";
import type { ShellExecutor } from "../utils/execFile.js";

function makeExecutor(): ShellExecutor {
  return vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
}

describe("IPv6Blocker", () => {
  it("Test 4: blockIPv6 on win32 calls netsh ipv6 interface args", async () => {
    const executor = makeExecutor();
    const blocker = createIPv6Blocker({ executor, platform: "win32" });

    await blocker.blockIPv6("homelan");

    expect(executor).toHaveBeenCalledWith("netsh", [
      "interface",
      "ipv6",
      "set",
      "interface",
      "homelan",
      "advertise=disabled",
    ]);
  });

  it("Test 5: restoreIPv6 on darwin calls networksetup -setv6automatic", async () => {
    const executor = makeExecutor();
    const blocker = createIPv6Blocker({ executor, platform: "darwin" });

    await blocker.restoreIPv6("homelan");

    expect(executor).toHaveBeenCalledWith("networksetup", [
      "-setv6automatic",
      "homelan",
    ]);
  });
});
