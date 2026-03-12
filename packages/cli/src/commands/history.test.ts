import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockIsRunning = vi.fn<() => Promise<boolean>>();
const mockGet = vi.fn();

vi.mock("../ipcClient.js", () => ({
  IpcClient: vi.fn().mockImplementation(() => ({
    isRunning: mockIsRunning,
    get: mockGet,
  })),
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
    throw "__PROCESS_EXIT__";
  }) as () => never);
}

function restoreIO() {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  exitSpy.mockRestore();
}

/** All stdout joined */
function stdout(): string {
  return stdoutChunks.join("");
}

/** First stdout chunk (useful when the catch re-throw adds extra output) */
function stdoutFirstChunk(): string {
  return stdoutChunks[0] ?? "";
}

function stderr(): string {
  return stderrChunks.join("");
}

/** First exit code (the intentional one) */
function firstExitCode(): number | undefined {
  return exitCodes[0];
}

async function runHistory(args: string[] = []) {
  const { historyCommand } = await import("./history.js");
  const cmd = historyCommand();
  try {
    await cmd.parseAsync(["node", "history", ...args]);
  } catch {
    // Swallow — process.exit sentinel or Commander error
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("history command", () => {
  beforeEach(() => {
    captureIO();
    mockIsRunning.mockReset();
    mockGet.mockReset();
  });

  afterEach(() => {
    restoreIO();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("outputs JSON when daemon returns entries with --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const entries = [
      {
        timestamp: "2025-01-15T10:30:00Z",
        action: "connect",
        mode: "lan-only",
        duration_ms: 60000,
        fallback_method: "relay",
      },
    ];
    mockGet.mockResolvedValue({ entries });

    await runHistory(["--json"]);

    // The history command writes JSON then calls process.exit(0) which
    // throws our sentinel, caught by the catch block that writes to stderr
    // and calls process.exit(1). We check the first exit code and first stdout chunk.
    const out = JSON.parse(stdoutFirstChunk());
    expect(out).toEqual(entries);
    expect(firstExitCode()).toBe(0);
  });

  it("outputs table when daemon returns entries without --json", async () => {
    mockIsRunning.mockResolvedValue(true);
    const entries = [
      {
        timestamp: "2025-01-15T10:30:00Z",
        action: "connect",
        mode: "lan-only",
        duration_ms: 61000,
        fallback_method: "relay",
      },
    ];
    mockGet.mockResolvedValue({ entries });

    await runHistory([]);

    const out = stdout();
    // Table header
    expect(out).toContain("Timestamp");
    expect(out).toContain("Action");
    expect(out).toContain("Mode");
    expect(out).toContain("Duration");
    expect(out).toContain("Method");
    // Row data
    expect(out).toContain("connect");
    expect(out).toContain("lan-only");
    expect(out).toContain("1m 1s");
    expect(out).toContain("relay");
    expect(firstExitCode()).toBe(0);
  });

  // ── Empty history ────────────────────────────────────────────────────

  it("prints 'No connection history yet.' when entries array is empty", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockGet.mockResolvedValue({ entries: [] });

    await runHistory([]);

    expect(stdout()).toContain("No connection history yet.");
    expect(firstExitCode()).toBe(0);
  });

  // ── Daemon not running ───────────────────────────────────────────────

  it("outputs JSON error when daemon is not running with --json", async () => {
    mockIsRunning.mockResolvedValue(false);

    await runHistory(["--json"]);

    const out = JSON.parse(stdoutFirstChunk());
    expect(out).toEqual({ ok: false, error: "Daemon is not running" });
    expect(firstExitCode()).toBe(3);
  });

  it("writes to stderr when daemon is not running without --json", async () => {
    mockIsRunning.mockResolvedValue(false);

    await runHistory([]);

    expect(stderr()).toContain("homelan daemon is not running");
    expect(firstExitCode()).toBe(3);
  });

  // ── Custom --limit parameter ─────────────────────────────────────────

  it("passes custom --limit to the URL query parameter", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockGet.mockResolvedValue({ entries: [] });

    await runHistory(["--limit", "50"]);

    expect(mockGet).toHaveBeenCalledWith("/history?limit=50");
  });

  it("uses default limit of 20 when --limit is not specified", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockGet.mockResolvedValue({ entries: [] });

    await runHistory([]);

    expect(mockGet).toHaveBeenCalledWith("/history?limit=20");
  });

  // ── Generic error ────────────────────────────────────────────────────

  it("outputs error to stderr on generic error with --json and exits 1", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockGet.mockRejectedValue(new Error("Internal server error"));

    await runHistory(["--json"]);

    expect(stderr()).toContain("Error: Internal server error");
    expect(firstExitCode()).toBe(1);
  });

  it("outputs error to stderr on generic error without --json and exits 1", async () => {
    mockIsRunning.mockResolvedValue(true);
    mockGet.mockRejectedValue(new Error("Connection reset"));

    await runHistory([]);

    expect(stderr()).toContain("Error: Connection reset");
    expect(firstExitCode()).toBe(1);
  });
});

// ── formatDuration tests (via table output) ─────────────────────────────────

describe("formatDuration (via table output)", () => {
  beforeEach(() => {
    captureIO();
    mockIsRunning.mockReset();
    mockGet.mockReset();
    mockIsRunning.mockResolvedValue(true);
  });

  afterEach(() => {
    restoreIO();
  });

  it("renders '--' when duration_ms is undefined", async () => {
    mockGet.mockResolvedValue({
      entries: [
        { timestamp: "2025-01-15T10:00:00Z", action: "connect" },
      ],
    });

    await runHistory([]);

    const out = stdout();
    const lines = out.split("\n").filter((l) => l.trim());
    const dataLine = lines[1];
    expect(dataLine).toContain("--");
  });

  it("renders '0s' when duration_ms is 0", async () => {
    mockGet.mockResolvedValue({
      entries: [
        { timestamp: "2025-01-15T10:00:00Z", action: "disconnect", duration_ms: 0 },
      ],
    });

    await runHistory([]);

    expect(stdout()).toContain("0s");
  });

  it("renders '30s' when duration_ms is 30000", async () => {
    mockGet.mockResolvedValue({
      entries: [
        { timestamp: "2025-01-15T10:00:00Z", action: "disconnect", duration_ms: 30000 },
      ],
    });

    await runHistory([]);

    expect(stdout()).toContain("30s");
  });

  it("renders '1m 1s' when duration_ms is 61000", async () => {
    mockGet.mockResolvedValue({
      entries: [
        { timestamp: "2025-01-15T10:00:00Z", action: "disconnect", duration_ms: 61000 },
      ],
    });

    await runHistory([]);

    expect(stdout()).toContain("1m 1s");
  });
});

describe("printHistoryTable (via command output)", () => {
  beforeEach(() => {
    captureIO();
    mockIsRunning.mockReset();
    mockGet.mockReset();
    mockIsRunning.mockResolvedValue(true);
  });

  afterEach(() => {
    restoreIO();
  });

  it("renders a single entry with all fields populated", async () => {
    mockGet.mockResolvedValue({
      entries: [
        {
          timestamp: "2025-01-15T10:30:00Z",
          action: "connect",
          mode: "full-gateway",
          duration_ms: 120000,
          fallback_method: "direct",
        },
      ],
    });

    await runHistory([]);

    const out = stdout();
    expect(out).toContain("Timestamp");
    expect(out).toContain("Action");
    expect(out).toContain("Mode");
    expect(out).toContain("Duration");
    expect(out).toContain("Method");
    expect(out).toContain("connect");
    expect(out).toContain("full-gateway");
    expect(out).toContain("2m 0s");
    expect(out).toContain("direct");
    expect(firstExitCode()).toBe(0);
  });

  it("renders '--' for missing optional fields (mode, duration, method)", async () => {
    mockGet.mockResolvedValue({
      entries: [
        {
          timestamp: "2025-01-15T10:30:00Z",
          action: "error",
        },
      ],
    });

    await runHistory([]);

    const out = stdout();
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const dataLine = lines[1];
    expect(dataLine).toContain("error");

    const dashes = (dataLine.match(/--/g) ?? []).length;
    expect(dashes).toBeGreaterThanOrEqual(3);
  });
});
