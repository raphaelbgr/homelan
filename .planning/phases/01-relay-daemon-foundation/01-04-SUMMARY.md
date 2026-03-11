---
phase: 01-relay-daemon-foundation
plan: "04"
subsystem: daemon
tags: [ipc, express, sse, rest, keychain, state-machine, daemon, localhost]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@homelan/shared types (DaemonStatus, IpcStatusResponse, SseEvent, ConnectionState)"
  - phase: 01-03
    provides: "KeychainStore, StateMachine, generateKeypair()"
provides:
  - "createIpcServer(daemon): Express factory — routes status, devices, events, stub POST endpoints"
  - "statusRouter: GET /status returns full DaemonStatus JSON"
  - "devicesRouter: GET /devices returns { devices: [] } (Phase 1 empty)"
  - "eventsRouter: GET /events SSE stream, initial event on connect, broadcasts state transitions"
  - "connectRouter / disconnectRouter / switchModeRouter: POST returns 501 NOT_IMPLEMENTED"
  - "Daemon class: orchestrates KeychainStore + StateMachine, generates/retrieves WireGuard keypair"
  - "derivePublicKeyFromPrivate(): PKCS8 DER reconstruction, avoids storing public key separately"
  - "index.ts: process entry point on 127.0.0.1:30001 with SIGTERM/SIGINT graceful shutdown"
affects:
  - 02-tunnel-nat-cli
  - 04-desktop-gui

# Tech tracking
tech-stack:
  added:
    - "supertest 6.x (HTTP integration testing for IPC server routes)"
    - "@types/supertest (TypeScript types for supertest)"
    - "node:http (raw HTTP client used in SSE streaming tests)"
  patterns:
    - "createIpcServer(daemon) factory: accepts Daemon instance, returns Express app"
    - "Localhost-only security middleware: rejects non-127.0.0.1/::1 connections with 403"
    - "SSE eventsRouter: sends initial state_changed on connect, keepalive comment every 30s"
    - "MockDaemon stub in tests: no real keychain, no real StateMachine — pure interface compliance"
    - "SSE tests use real http.Server on random port — collectSse() collects chunks then destroys"
    - "Explicit Express return types on all router factories to fix TS2742 portability errors"

key-files:
  created:
    - packages/daemon/src/ipc/server.ts
    - packages/daemon/src/ipc/routes/status.ts
    - packages/daemon/src/ipc/routes/devices.ts
    - packages/daemon/src/ipc/routes/events.ts
    - packages/daemon/src/ipc/routes/connect.ts
    - packages/daemon/src/ipc/routes/disconnect.ts
    - packages/daemon/src/ipc/routes/switchMode.ts
    - packages/daemon/src/ipc/server.test.ts
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/daemon.test.ts
    - packages/daemon/src/index.ts
  modified:
    - packages/daemon/package.json

key-decisions:
  - "SSE tests use http.Server on random port with collectSse() — supertest buffer/parse API does not emit data events for streaming responses in this environment"
  - "Explicit Router/Express return type annotations required on all factories — TS2742 portability error from inferred express-serve-static-core references under NodeNext"
  - "derivePublicKeyFromPrivate() reconstructs PKCS8 DER from raw 32-byte base64 — avoids storing public key and avoids wg binary dependency"

requirements-completed:
  - DAEM-03
  - DAEM-04
  - DAEM-05
  - DAEM-06

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 1 Plan 04: IPC HTTP Server, SSE Events, and Process Entry Point Summary

**Express IPC server on localhost:30001 with GET /status, GET /events (SSE), stub POST endpoints, Daemon orchestrator wiring keychain + state machine, and process entry point with graceful shutdown**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-11T19:31:18Z
- **Completed:** 2026-03-11T19:37:40Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- `createIpcServer(daemon)` factory: Express app with localhost-only security middleware, mounts all route handlers
- `statusRouter` returns full DaemonStatus JSON matching the IpcStatusResponse schema (all 8 fields)
- `eventsRouter` sets SSE headers, sends initial `state_changed` event on connect, subscribes to state machine transitions, writes keepalive comments every 30s, and cleans up on close
- `connectRouter`, `disconnectRouter`, `switchModeRouter` all return 501 NOT_IMPLEMENTED with `{ error, code }` schema
- `Daemon` class: loads existing private key or generates new X25519 keypair on first start, derives public key without storing it separately, exposes `getStatus()`, `getLanDevices()`, `onStateChange()`
- `index.ts` entry point: binds to `127.0.0.1:30001`, logs public key, handles SIGTERM/SIGINT with `server.close()` + `process.exit(0)`
- 61 total tests passing across 6 test files; TypeScript build zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: IPC server with status, devices, SSE events routes** - `a1ccf25` (feat)
2. **Task 2: Stub endpoints, Daemon orchestrator, process entry point** - `986d216` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `packages/daemon/src/ipc/server.ts` - createIpcServer() factory with localhost security middleware and all route mounts
- `packages/daemon/src/ipc/routes/status.ts` - GET /status handler delegating to daemon.getStatus()
- `packages/daemon/src/ipc/routes/devices.ts` - GET /devices handler returning { devices: [] }
- `packages/daemon/src/ipc/routes/events.ts` - GET /events SSE handler with initial event, transition subscription, keepalive
- `packages/daemon/src/ipc/routes/connect.ts` - POST /connect stub returning 501 NOT_IMPLEMENTED
- `packages/daemon/src/ipc/routes/disconnect.ts` - POST /disconnect stub returning 501 NOT_IMPLEMENTED
- `packages/daemon/src/ipc/routes/switchMode.ts` - POST /switch-mode stub returning 501 NOT_IMPLEMENTED
- `packages/daemon/src/ipc/server.test.ts` - 14 tests: status schema, devices, health, 404, SSE headers, SSE events, stub 501s
- `packages/daemon/src/daemon.ts` - Daemon class: KeychainStore + StateMachine orchestration, keygen, derivePublicKeyFromPrivate()
- `packages/daemon/src/daemon.test.ts` - 13 tests: key generation, key retrieval, getStatus schema, state delegation
- `packages/daemon/src/index.ts` - Process entry point: listen on 127.0.0.1:30001, SIGTERM/SIGINT shutdown
- `packages/daemon/package.json` - Added supertest, @types/supertest dev deps

## Decisions Made

- **SSE test strategy:** supertest's `.buffer(false).parse()` API does not emit data events in the Vitest/Node.js environment; replaced with `http.Server` on random port + `collectSse()` helper that collects chunks for a fixed duration then destroys the request. This reliably captures streaming data without hanging.
- **Explicit Express return types:** All router factory functions require explicit `Router` return type annotation under TypeScript `NodeNext` + `declarationMap`. Without it, TS2742 fires — the inferred type references an internal `express-serve-static-core` path not portable across installs.
- **derivePublicKeyFromPrivate():** Reconstructs PKCS8 DER structure from raw 32-byte base64 private key using `node:crypto`. Avoids storing the public key separately (single source of truth in private key) and avoids `wg pubkey` binary dependency in the Daemon class.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explicit TypeScript return types on all router factories**
- **Found during:** Task 2 build verification (`pnpm build`)
- **Issue:** TypeScript TS2742 error — inferred return types of `statusRouter`, `devicesRouter`, `eventsRouter`, `connectRouter`, `disconnectRouter`, `switchModeRouter`, and `createIpcServer` referenced `.pnpm/@types+express-serve-static-core@5.1.1/...` internal paths, which are not portable under `declarationMap: true` + `NodeNext` module resolution.
- **Fix:** Added explicit `: ExpressRouter` and `: Express` return type annotations to all factory functions
- **Files modified:** All 6 route files + `server.ts`
- **Commit:** 986d216 (Task 2 commit)

**2. [Rule 1 - Bug] SSE test approach — supertest streaming**
- **Found during:** Task 1 test GREEN phase
- **Issue:** supertest `.buffer(false).parse()` pattern does not emit `data` events from the underlying IncomingMessage in the test environment — tests timed out waiting for chunks
- **Fix:** Replaced with `http.Server` on a random OS-assigned port + `collectSse(port, durationMs)` helper that uses `http.request()` and collects response chunks for a fixed duration, then destroys the request to end the stream
- **Files modified:** `packages/daemon/src/ipc/server.test.ts`
- **Commit:** a1ccf25 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 build error, 1 test infrastructure)
**Impact on plan:** Both were implementation-level fixes; no scope changes, no API changes. All must_haves.truths verified.

## Self-Check: PASSED

Files verified to exist:
- `packages/daemon/src/ipc/server.ts` - FOUND
- `packages/daemon/src/ipc/routes/status.ts` - FOUND
- `packages/daemon/src/ipc/routes/events.ts` - FOUND
- `packages/daemon/src/daemon.ts` - FOUND
- `packages/daemon/src/index.ts` - FOUND

Commits verified:
- `a1ccf25` - FOUND (Task 1)
- `986d216` - FOUND (Task 2)

Build: zero TypeScript errors
Tests: 61/61 passing

---
*Phase: 01-relay-daemon-foundation*
*Completed: 2026-03-11*
