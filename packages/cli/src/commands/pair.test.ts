import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockIsRunning = vi.fn<() => Promise<boolean>>();
const mockPost = vi.fn();

vi.mock("../ipcClient.js", () => {
  class MockIpcClientError extends Error {
    public readonly statusCode: number | null;
    constructor(message: string, statusCode: number | null) {
      super(message);
      this.name = "IpcClientError";
      this.statusCode = statusCode;
    }
  }
  return {
    IpcClient: vi.fn().mockImplementation(() => ({
      isRunning: mockIsRunning,
      post: mockPost,
    })),
    IpcClientError: MockIpcClientError,
  };
});

const mockSpinner = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
};
mockSpinner.start.mockReturnValue(mockSpinner);

vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

let stdoutChunks: string[];
let stderrChunks: string[];
let exitCodes: number[];
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;
let exitSpy: ReturnType<typeof vi.spyOn>;

function captureIO() {
  stdoutChunks = [];
  stderrChunks = [];
  exitCodes = [];

  originalStdoutWrite = process.stdout.write;
  originalStderrWrite = process.stderr.write;

  process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as unknown as typeof process.stdout.write;

  process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as unknown as typeof process.stderr.write;

  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCodes.push(code ?? 0);
    // Throw a string sentinel — not an Error instance, so the command's
    // catch blocks that test `err instanceof Error` won't generate
    // IpcClientError-style output.  However, the generic catch in
    // pair.ts DOES call `String(err)` on non-Error values, so the
    // happy-path `process.exit(0)` throw will cause a second exit(1).
    // We track ALL exit codes and check the FIRST one.
    throw "__PROCESS_EXIT__";
  }) as () => never);
}

function restoreIO() {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  exitSpy.mockRestore();
}

/** First line of stdout (to avoid pollution from catch-block re-throw) */
function stdoutFirstLine(): string {
  return stdoutChunks[0] ?? "";
}

function stderr(): string {
  return stderrChunks.join("");
}

/** First exit code recorded (the intentional one, before catch re-throw) */
function firstExitCode(): number | undefined {
  return exitCodes[0];
}

async function runPairAction(inviteUrl: string, opts: { json: boolean }) {
  const { pairCommand } = await import("./pair.js");
  const cmd = pairCommand();
  try {
    await cmd.parseAsync(["node", "pair", inviteUrl, ...(opts.json ? ["--json"] : [])]);
  } catch {
    // Swallow — process.exit sentinel or Commander error
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("pair command", () => {
  beforeEach(() => {
    captureIO();
    mockIsRunning.mockReset();
    mockPost.mockReset();
    mockSpinner.start.mockClear().mockReturnValue(mockSpinner);
    mockSpinner.succeed.mockClear();
    mockSpinner.fail.mockClear();
    mockSpinner.stop.mockClear();
  });

  afterEach(() => {
    restoreIO();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("outputs JSON on successful pairing with --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockPost.mockResolvedValue({ ok: true, serverPublicKey: "pk_abc123" });

    await runPairAction("homelan://invite/abc123", { json: true });

    const out = JSON.parse(stdoutFirstLine());
    expect(out).toEqual({ ok: true, serverPublicKey: "pk_abc123" });
    expect(firstExitCode()).toBe(0);
  });

  it("shows spinner success on successful pairing without --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockPost.mockResolvedValue({ ok: true, serverPublicKey: "pk_abc123" });

    await runPairAction("homelan://invite/abc123", { json: false });

    expect(mockSpinner.succeed).toHaveBeenCalledWith("Paired successfully");
    expect(firstExitCode()).toBe(0);
  });

  // ── Daemon not running ────────────────────────────────────────────────

  it("outputs JSON error when daemon is not running with --json", async () => {
    mockIsRunning.mockResolvedValue(false);

    await runPairAction("homelan://invite/abc123", { json: true });

    const out = JSON.parse(stdoutFirstLine());
    expect(out).toEqual({ ok: false, error: "Daemon is not running" });
    expect(firstExitCode()).toBe(3);
  });

  it("writes to stderr when daemon is not running without --json", async () => {
    mockIsRunning.mockResolvedValue(false);

    await runPairAction("homelan://invite/abc123", { json: false });

    expect(stderr()).toContain("Daemon is not running");
    expect(stderr()).toContain("homelan start");
    expect(firstExitCode()).toBe(3);
  });

  // ── 409 Conflict (already connected) ─────────────────────────────────

  it("outputs JSON on 409 conflict with --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const { IpcClientError } = await import("../ipcClient.js");
    mockPost.mockRejectedValue(
      new IpcClientError("POST /pair failed with status 409", 409)
    );

    await runPairAction("homelan://invite/abc123", { json: true });

    const out = JSON.parse(stdoutFirstLine());
    expect(out).toEqual({
      ok: false,
      error: "Cannot pair while connected. Disconnect first.",
    });
    expect(firstExitCode()).toBe(1);
  });

  it("shows spinner fail on 409 conflict without --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const { IpcClientError } = await import("../ipcClient.js");
    mockPost.mockRejectedValue(
      new IpcClientError("POST /pair failed with status 409", 409)
    );

    await runPairAction("homelan://invite/abc123", { json: false });

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      "Cannot pair while connected. Disconnect first."
    );
    expect(firstExitCode()).toBe(1);
  });

  // ── Other IpcClientError (e.g. 400, 500) ─────────────────────────────

  it("outputs JSON on other IpcClientError with --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const { IpcClientError } = await import("../ipcClient.js");
    mockPost.mockRejectedValue(
      new IpcClientError("POST /pair failed with status 500", 500)
    );

    await runPairAction("homelan://invite/abc123", { json: true });

    const out = JSON.parse(stdoutFirstLine());
    expect(out).toEqual({
      ok: false,
      error: "POST /pair failed with status 500",
    });
    expect(firstExitCode()).toBe(1);
  });

  it("shows spinner fail on other IpcClientError without --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const { IpcClientError } = await import("../ipcClient.js");
    mockPost.mockRejectedValue(
      new IpcClientError("POST /pair failed with status 400", 400)
    );

    await runPairAction("homelan://invite/abc123", { json: false });

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      "Pairing failed: POST /pair failed with status 400"
    );
    expect(firstExitCode()).toBe(1);
  });

  // ── Non-IpcClientError exception ──────────────────────────────────────

  it("outputs JSON on non-IpcClientError with --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockPost.mockRejectedValue(new Error("Network error"));

    await runPairAction("homelan://invite/abc123", { json: true });

    const out = JSON.parse(stdoutFirstLine());
    expect(out).toEqual({ ok: false, error: "Network error" });
    expect(firstExitCode()).toBe(1);
  });

  it("shows spinner fail on non-IpcClientError without --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockPost.mockRejectedValue(new Error("ETIMEDOUT"));

    await runPairAction("homelan://invite/abc123", { json: false });

    expect(mockSpinner.fail).toHaveBeenCalledWith("Pairing failed: ETIMEDOUT");
    expect(firstExitCode()).toBe(1);
  });

  // ── Missing argument ─────────────────────────────────────────────────

  it("exits with error when invite-url argument is missing", async () => {
    const { pairCommand } = await import("./pair.js");
    const cmd = pairCommand();
    cmd.exitOverride();
    cmd.configureOutput({
      writeErr: () => {},
      writeOut: () => {},
    });

    let threwCommanderError = false;
    try {
      await cmd.parseAsync(["node", "pair"]);
    } catch {
      threwCommanderError = true;
    }

    expect(threwCommanderError).toBe(true);
  });
});
