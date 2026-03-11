---
phase: 02-tunnel-connectivity-nat-traversal
plan: "02"
subsystem: api
tags: [websocket, ws, relay, nat-traversal, wireguard, proxy]

# Dependency graph
requires:
  - phase: 01-relay-daemon-foundation
    provides: Express relay server with /register, /lookup, /health routes and RelayConfig type
provides:
  - WebSocket /relay endpoint that pairs peers by sessionToken and proxies raw binary WireGuard UDP frames
  - createRelayHandler(config, options) factory in packages/relay/src/routes/relay.ts
  - http.Server upgrade-based mounting in index.ts (replaces app.listen())
affects:
  - 02-03-nat-hole-punching (will connect to /relay WebSocket when hole punching fails)
  - 02-04-daemon-connect (daemon relay fallback uses this endpoint)

# Tech tracking
tech-stack:
  added: [ws@^8.17.0, "@types/ws@^8.5"]
  patterns:
    - noServer WebSocketServer with handleUpgrade for Express-compatible WS handling
    - JSON handshake frame as first WS message for auth + session routing
    - Map<sessionToken, WebSocket> for peer pairing state
    - http.createServer(app) + server.on("upgrade") pattern for coexisting HTTP + WS on same port

key-files:
  created:
    - packages/relay/src/routes/relay.ts
    - packages/relay/src/routes/relay.test.ts
  modified:
    - packages/relay/package.json
    - packages/relay/src/app.ts
    - packages/relay/src/index.ts

key-decisions:
  - "createRelayHandler accepts optional pairingTimeoutMs (default 10s) for testability without fixed 10s waits in tests"
  - "Binary frames passed through as-is using ws send({ binary: isBinary }) — no re-encoding of WireGuard UDP frames"
  - "Single WebSocketServer instance per createRelayHandler call; noServer:true delegates upgrade handling to caller"
  - "Relay closes both peers when either disconnects — no half-open connections"

patterns-established:
  - "WS upgrade handler factory pattern: createRelayHandler returns (req, socket, head) => void"
  - "Pairing via Map<token, WebSocket> — lightweight, no persistence needed for relay session state"

requirements-completed: [NAT-03]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 2 Plan 02: WebSocket Relay Endpoint Summary

**WebSocket /relay endpoint on the relay server that pairs two WireGuard peers by sessionToken and proxies raw binary UDP frames bidirectionally, using ws@^8 with noServer upgrade pattern**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T20:04:47Z
- **Completed:** 2026-03-11T20:09:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- WebSocket relay handler that validates relaySecret on handshake and closes with code 4001 on auth failure
- Peer pairing by shared sessionToken with binary frame proxy (raw WireGuard UDP pass-through)
- Configurable pairing timeout (default 10s) that closes unpaired lone peers
- Refactored index.ts from app.listen() to http.createServer() + upgrade event for WebSocket coexistence on same port
- 22 tests passing (18 existing HTTP + 4 new WebSocket tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: WebSocket relay route + ws dependency** - `a776394` (feat)
2. **Task 2: Mount relay handler on HTTP server** - `771d27a` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 followed TDD: tests written first (RED - import fail), then implementation (GREEN - all 4 pass)_

## Files Created/Modified
- `packages/relay/src/routes/relay.ts` - createRelayHandler factory; WS pairing + binary proxy logic
- `packages/relay/src/routes/relay.test.ts` - 4 WebSocket integration tests (auth reject, binary proxy, disconnect propagation, timeout)
- `packages/relay/package.json` - Added ws@^8.17.0 (dep) and @types/ws@^8.5 (devDep)
- `packages/relay/src/app.ts` - Re-exports createRelayHandler for convenience
- `packages/relay/src/index.ts` - Refactored to http.createServer + upgrade handler mounting

## Decisions Made
- `createRelayHandler` accepts `options.pairingTimeoutMs` to override the 10s default — makes Test 4 fast (200ms) without mocking timers
- Binary frames proxied with `{ binary: isBinary }` flag to preserve WireGuard framing exactly
- `noServer: true` on WebSocketServer so the Express HTTP server owns the TCP listener
- Lone peer cleanup on disconnect prevents Map leaks when waiting peer closes before partner arrives

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - tests passed green on first implementation attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- /relay WebSocket endpoint is live and ready for daemon relay fallback client in plan 02-03/02-04
- NAT hole punching (02-03) can now use this as its fallback path when direct UDP fails
- Relay binary proxy tested end-to-end: binary frames from peer A arrive at peer B unchanged

---
*Phase: 02-tunnel-connectivity-nat-traversal*
*Completed: 2026-03-11*
