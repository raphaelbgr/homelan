/**
 * IPC server tests — uses a mock Daemon stub to avoid real keychain / WireGuard interaction.
 * supertest is used for HTTP assertions. SSE tests use a real http.Server to test streaming.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import http from "node:http";
import type { Application } from "express";
import type { ConnectionState, LanDevice } from "@homelan/shared";
import type { IpcStatusResponse } from "@homelan/shared";

// ---- Minimal Daemon stub (injected into createIpcServer) ----
class MockDaemon {
  private _state: ConnectionState = "idle";
  private _startedAt = Date.now();
  private _listeners: Array<(next: ConnectionState, prev: ConnectionState) => void> = [];

  get state(): ConnectionState {
    return this._state;
  }

  get uptimeMs(): number {
    return Date.now() - this._startedAt;
  }

  getStatus(): IpcStatusResponse {
    return {
      state: this._state,
      mode: null,
      latencyMs: null,
      throughputBytesPerSec: null,
      hostInfo: null,
      connectedPeers: [],
      lanDevices: [],
      uptimeMs: this.uptimeMs,
    };
  }

  getLanDevices(): LanDevice[] {
    return [];
  }

  onStateChange(fn: (next: ConnectionState, prev: ConnectionState) => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  // Test helper — trigger a transition without the real state machine
  _triggerTransition(next: ConnectionState, prev: ConnectionState): void {
    this._state = next;
    for (const fn of this._listeners) {
      fn(next, prev);
    }
  }
}

// Dynamic import so we don't evaluate before files are written
let createIpcServer: (daemon: MockDaemon) => Application;

describe("IPC server", () => {
  let daemon: MockDaemon;
  let app: Application;
  let server: http.Server | null = null;
  let serverPort = 0;

  beforeEach(async () => {
    if (!createIpcServer) {
      const mod = await import("./server.js");
      createIpcServer = mod.createIpcServer as typeof createIpcServer;
    }
    daemon = new MockDaemon();
    app = createIpcServer(daemon as never);
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
      serverPort = 0;
    }
  });

  function startServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const addr = server!.address() as { port: number };
        serverPort = addr.port;
        resolve(serverPort);
      });
      server.on("error", reject);
    });
  }

  // --- GET /status ---
  describe("GET /status", () => {
    it("returns 200 with JSON body", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/json/);
    });

    it("returns all required DaemonStatus fields", async () => {
      const res = await request(app).get("/status");
      const body = res.body as IpcStatusResponse;
      expect(body).toHaveProperty("state");
      expect(body).toHaveProperty("mode");
      expect(body).toHaveProperty("latencyMs");
      expect(body).toHaveProperty("throughputBytesPerSec");
      expect(body).toHaveProperty("hostInfo");
      expect(body).toHaveProperty("connectedPeers");
      expect(body).toHaveProperty("lanDevices");
      expect(body).toHaveProperty("uptimeMs");
    });

    it("returns state: idle and mode: null on fresh daemon", async () => {
      const res = await request(app).get("/status");
      expect(res.body.state).toBe("idle");
      expect(res.body.mode).toBeNull();
    });

    it("connectedPeers and lanDevices are arrays", async () => {
      const res = await request(app).get("/status");
      expect(Array.isArray(res.body.connectedPeers)).toBe(true);
      expect(Array.isArray(res.body.lanDevices)).toBe(true);
    });
  });

  // --- GET /devices ---
  describe("GET /devices", () => {
    it("returns 200 with devices array", async () => {
      const res = await request(app).get("/devices");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("devices");
      expect(Array.isArray(res.body.devices)).toBe(true);
    });

    it("returns empty devices array in Phase 1", async () => {
      const res = await request(app).get("/devices");
      expect(res.body.devices).toHaveLength(0);
    });
  });

  // --- GET /health ---
  describe("GET /health", () => {
    it("returns 200 with ok: true and uptimeMs", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.uptimeMs).toBe("number");
    });
  });

  // --- 404 for unknown routes ---
  describe("unknown routes", () => {
    it("returns 404 with IpcError shape", async () => {
      const res = await request(app).get("/unknown-route");
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });

  // --- GET /events (SSE) ---
  // Uses a real http.Server on a random port so we can consume the SSE stream.
  // We collect chunks in a buffer and resolve once we have the data we need.
  describe("GET /events", () => {
    function collectSse(port: number, durationMs: number): Promise<string> {
      return new Promise((resolve) => {
        const req = http.request(
          { hostname: "127.0.0.1", port, path: "/events", method: "GET" },
          (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk: string) => { body += chunk; });
            res.on("end", () => resolve(body));
            res.on("error", () => resolve(body));
          }
        );
        req.on("error", () => resolve(""));
        req.end();

        // Destroy after durationMs — this causes the response to end and resolve
        setTimeout(() => req.destroy(), durationMs);
      });
    }

    it("returns SSE headers", async () => {
      const port = await startServer();
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: "127.0.0.1", port, path: "/events", method: "GET" },
          (res) => {
            // Check headers immediately, then abort
            expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
            expect(res.headers["cache-control"]).toMatch(/no-cache/);
            req.destroy();
            resolve();
          }
        );
        req.on("error", (err: NodeJS.ErrnoException) => {
          // ECONNRESET expected from destroy()
          if (err.code === "ECONNRESET") resolve();
          else reject(err);
        });
        req.end();
      });
    }, 5000);

    it("sends initial state_changed event on connection", async () => {
      const port = await startServer();
      const raw = await collectSse(port, 300);
      expect(raw).toMatch(/data: /);
      expect(raw).toMatch(/state_changed/);
    }, 5000);

    it("sends state_changed event when state machine transitions", async () => {
      const port = await startServer();

      // Schedule transition after connection established
      setTimeout(() => {
        daemon._triggerTransition("connecting", "idle");
      }, 100);

      const raw = await collectSse(port, 500);
      const dataLines = raw.match(/data: /g);
      expect(dataLines).not.toBeNull();
      expect((dataLines ?? []).length).toBeGreaterThanOrEqual(2);
      expect(raw).toMatch(/connecting/);
    }, 5000);
  });

  // --- Stub POST endpoints ---
  describe("POST stub endpoints", () => {
    it("POST /connect returns 501 NOT_IMPLEMENTED", async () => {
      const res = await request(app).post("/connect").send({});
      expect(res.status).toBe(501);
      expect(res.body.code).toBe("NOT_IMPLEMENTED");
    });

    it("POST /disconnect returns 501 NOT_IMPLEMENTED", async () => {
      const res = await request(app).post("/disconnect").send({});
      expect(res.status).toBe(501);
      expect(res.body.code).toBe("NOT_IMPLEMENTED");
    });

    it("POST /switch-mode returns 501 NOT_IMPLEMENTED", async () => {
      const res = await request(app).post("/switch-mode").send({});
      expect(res.status).toBe(501);
      expect(res.body.code).toBe("NOT_IMPLEMENTED");
    });
  });
});
