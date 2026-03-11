import { describe, it, expect, vi } from "vitest";
import { WireGuardInterface, WireGuardError } from "./interface.js";
import type { ShellExecutor } from "../utils/execFile.js";

function makeMockExecutor(
  response: { stdout: string; stderr: string } = { stdout: "", stderr: "" }
): ShellExecutor {
  return vi.fn().mockResolvedValue(response);
}

const baseConfig = {
  privateKey: "dGVzdC1wcml2YXRlLWtleXRlc3QtcHJpdmF0ZS1rZXk=",
  address: "10.0.0.1/24",
  listenPort: 51820,
  peers: [],
};

describe("WireGuardInterface", () => {
  describe("configure()", () => {
    it("stores config without error", () => {
      const wg = new WireGuardInterface("wg0", makeMockExecutor());
      expect(() => wg.configure(baseConfig)).not.toThrow();
    });
  });

  describe("up()", () => {
    it("throws WireGuardError if configure() was not called first", async () => {
      const wg = new WireGuardInterface("wg0", makeMockExecutor());
      await expect(wg.up()).rejects.toThrow(WireGuardError);
      await expect(wg.up()).rejects.toThrow(/configure/);
    });

    it("calls executor with wg-quick and 'up' + a .conf path as separate args", async () => {
      const executor = makeMockExecutor();
      const wg = new WireGuardInterface("wg0", executor);
      wg.configure(baseConfig);
      await wg.up();
      expect(executor).toHaveBeenCalledOnce();
      const [cmd, args] = (executor as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
      expect(cmd).toBe("wg-quick");
      expect(args[0]).toBe("up");
      expect(args[1]).toMatch(/\.conf$/);
    });

    it("wg-quick args are separate array elements (not a single string)", async () => {
      const executor = makeMockExecutor();
      const wg = new WireGuardInterface("wg0", executor);
      wg.configure(baseConfig);
      await wg.up();
      const [, args] = (executor as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
      // If args were interpolated into one string, args.length would be 1
      expect(args.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("down()", () => {
    it("calls executor with wg-quick, 'down', and interface name as separate args", async () => {
      const executor = makeMockExecutor();
      const wg = new WireGuardInterface("wg0", executor);
      await wg.down();
      expect(executor).toHaveBeenCalledOnce();
      const [cmd, args] = (executor as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
      expect(cmd).toBe("wg-quick");
      expect(args).toEqual(["down", "wg0"]);
    });
  });

  describe("status()", () => {
    it("returns { isUp: false, peers: [] } when executor returns empty output", async () => {
      const executor = makeMockExecutor({ stdout: "", stderr: "" });
      const wg = new WireGuardInterface("wg0", executor);
      const status = await wg.status();
      expect(status).toEqual({ isUp: false, peers: [] });
    });

    it("returns { isUp: false, peers: [] } when executor throws (interface not found)", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("wg: interface not found"));
      const wg = new WireGuardInterface("wg0", executor as unknown as ShellExecutor);
      const status = await wg.status();
      expect(status).toEqual({ isUp: false, peers: [] });
    });
  });

  describe("config file generation", () => {
    it("calls executor with a path containing the interface name in the .conf file", async () => {
      const executor = makeMockExecutor();
      const wg = new WireGuardInterface("homelan0", executor);
      wg.configure(baseConfig);
      await wg.up();
      const [, args] = (executor as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
      expect(args[1]).toContain("homelan0");
    });

    it("config file includes [Interface] section with PrivateKey and Address", async () => {
      let writtenPath: string | undefined;
      let writtenContent: string | undefined;
      const executor = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "wg-quick" && args[0] === "up") {
          writtenPath = args[1];
          // Read the file that was written
          const { readFile } = await import("node:fs/promises");
          writtenContent = await readFile(writtenPath, "utf8");
        }
        return { stdout: "", stderr: "" };
      });
      const wg = new WireGuardInterface("wg0", executor as unknown as ShellExecutor);
      wg.configure(baseConfig);
      await wg.up();
      expect(writtenContent).toContain("[Interface]");
      expect(writtenContent).toContain("PrivateKey");
      expect(writtenContent).toContain("Address");
    });
  });
});
