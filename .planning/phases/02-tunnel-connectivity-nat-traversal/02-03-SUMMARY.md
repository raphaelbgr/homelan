---
phase: 02-tunnel-connectivity-nat-traversal
plan: 03
subsystem: nat
tags: [wireguard, udp, hole-punching, nat-traversal, stun, relay, ipc, daemon]

# Dependency graph
requires:
  - phase: 02-01
    provides: STUN resolveExternalEndpoint(), RelayClient register/lookup, NatTraversalConfig type
  - phase: 02-02
    provides: Relay WebSocket proxy (binary frame forwarding for relay fallback path)
  - phase: 01-03
    provides: WireGuardInterface.configure/up/down, StateMachine transitions, KeychainStore
  - phase: 01-04
    provides: Daemon class skeleton, IPC server with connect/disconnect route stubs

provides:
  - "holePunch.ts: attemptHolePunch(localPort, remoteEndpoint, timeoutMs) — UDP probe loop with success/timeout resolution"
  - "Daemon.connect(config): STUN→register→lookup→holePunch→WireGuard orchestration with relay fallback"
  - "Daemon.disconnect(): WireGuard teardown with state transition connected→disconnecting→idle"
  - "Daemon.onProgress(): connection progress event emitter (discovering_peer/trying_direct/trying_relay/connected)"
  - "IPC POST /connect: delegates to daemon.connect(), returns 200 {ok:true} on success"
  - "IPC POST /disconnect: delegates to daemon.disconnect(), returns 200 {ok:true}"
  - "SseEventType extended with connection_progress variant"

affects:
  - 02-04 (CLI connect/disconnect commands consume IPC /connect and /disconnect)
  - 03-01 (mode switching builds on daemon.connect() mode parameter)
  - 04-01 (GUI connects via IPC routes implemented here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency injection pattern: Daemon accepts stunResolver/relayClientFactory/holePunchFn/wgInterface for testability"
    - "Relay fallback endpoint derived from relay URL host:port (relay proxies WG UDP frames)"
    - "onProgress() listener pattern mirrors onStateChange() — returns unsubscribe fn"

key-files:
  created:
    - packages/daemon/src/nat/holePunch.ts
    - packages/daemon/src/nat/holePunch.test.ts
    - packages/daemon/src/daemon-connect.test.ts
  modified:
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/ipc/routes/connect.ts
    - packages/daemon/src/ipc/routes/disconnect.ts
    - packages/daemon/src/ipc/server.test.ts
    - packages/shared/src/types/ipc.ts
    - packages/daemon/src/nat/stun.ts

key-decisions:
  - "Relay fallback endpoint = relay URL host:port (not a separate config field); relay proxies WG frames on same URL"
  - "holePunchFn injected into Daemon for testability (same pattern as wgInterface injection)"
  - "IPC /connect reads RELAY_URL/RELAY_SECRET/PEER_PUBLIC_KEY from env vars for NatTraversalConfig"
  - "Daemon transitions to error state on connect() failure (not back to idle) — callers must reset via error→idle"

patterns-established:
  - "All Daemon dependencies injectable via constructor for unit-test isolation without mocking modules"
  - "Progress events flow: emitProgress() → _progressListeners[] — independent from state transitions"

requirements-completed: [TUNL-01, NAT-01, NAT-02, NAT-03, NAT-05]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 2 Plan 3: Core Tunnel Connection Logic Summary

**UDP hole punching module + Daemon.connect/disconnect orchestrating STUN→relay→WireGuard with relay fallback, wiring IPC /connect and /disconnect routes to deliver real connections instead of 501**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T20:12:47Z
- **Completed:** 2026-03-11T20:18:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built UDP hole punching module using node:dgram with 200ms probe interval and configurable timeout
- Implemented Daemon.connect() orchestrating the full P2P connection flow: STUN discovery → relay registration → peer lookup → hole punch attempt → WireGuard configure+up
- Relay fallback path: when hole punch fails, derive relay host:port from relay URL and use as WireGuard peer endpoint
- Daemon.disconnect() with clean state transitions and wgInterface.down()
- IPC POST /connect and /disconnect now delegate to daemon instead of returning 501
- 78 tests passing (71 prior + 7 new), TypeScript build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: UDP hole punch module** - `83d4c6e` (feat)
2. **Task 2: Daemon.connect/disconnect + IPC route wiring** - `42d6f06` (feat)

_Note: TDD tasks - each was test-first (RED) then implementation (GREEN)_

## Files Created/Modified
- `packages/daemon/src/nat/holePunch.ts` - UDP probe-based hole punch with success/timeout resolution
- `packages/daemon/src/nat/holePunch.test.ts` - 2 TDD tests (echo-back success, timeout failure)
- `packages/daemon/src/daemon.ts` - Added connect(), disconnect(), onProgress(); injected stunResolver/relayClientFactory/holePunchFn/wgInterface
- `packages/daemon/src/daemon-connect.test.ts` - 5 tests: state transitions, relay fallback, disconnect, progress events, guard on double-connect
- `packages/daemon/src/ipc/routes/connect.ts` - Implemented: reads mode from body, builds NatTraversalConfig from env, calls daemon.connect()
- `packages/daemon/src/ipc/routes/disconnect.ts` - Implemented: calls daemon.disconnect()
- `packages/daemon/src/ipc/server.test.ts` - Updated stale 501 tests to reflect new behavior (400/500 responses)
- `packages/shared/src/types/ipc.ts` - Added "connection_progress" to SseEventType union
- `packages/daemon/src/nat/stun.ts` - Fixed pre-existing TS strict errors (buffer indexing)

## Decisions Made
- Relay fallback endpoint derived from relay URL host:port — no separate config field needed since relay proxies WG UDP frames on the same host
- holePunchFn and wgInterface injected into Daemon for unit-test isolation, consistent with prior dependency injection pattern
- IPC /connect reads RELAY_URL/RELAY_SECRET/PEER_PUBLIC_KEY from environment variables — simple for Phase 2, can be improved later
- Daemon transitions to error state on connect() failure (not idle) — explicit reset path via error→idle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS strict errors in stun.ts**
- **Found during:** Task 2 (TypeScript build verification)
- **Issue:** Buffer array indexing `msg[offset + 4]` etc. produces `number | undefined` in noUncheckedIndexedAccess strict mode; blocked the clean build
- **Fix:** Cast cookieBytes to `[number, number, number, number]` tuple and added `?? 0` null coalescing on buffer reads
- **Files modified:** packages/daemon/src/nat/stun.ts
- **Verification:** TypeScript build passes with zero errors
- **Committed in:** 42d6f06 (Task 2 commit)

**2. [Rule 1 - Bug] Updated stale server.test.ts tests asserting 501 on /connect and /disconnect**
- **Found during:** Task 2 (test suite run after implementing routes)
- **Issue:** server.test.ts still asserted `expect(res.status).toBe(501)` for /connect and /disconnect — routes are now implemented so those assertions fail
- **Fix:** Updated tests to assert new behavior: 400 for invalid mode, 500 for missing env vars, 500 for disconnect when not connected
- **Files modified:** packages/daemon/src/ipc/server.test.ts
- **Verification:** All 78 tests pass
- **Committed in:** 42d6f06 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes were necessary for build correctness and test accuracy. No scope creep.

## Issues Encountered
- stun.ts buffer indexing was a latent TS strict mode issue from plan 02-01 that only surfaced now because the build wasn't clean in 02-01 verification (tests passed but build wasn't checked). Fixed as part of this plan.

## Next Phase Readiness
- Core tunnel connection logic complete — Phase 2 Plan 4 (CLI connect/disconnect commands) can now consume the IPC routes
- IPC /connect requires RELAY_URL, RELAY_SECRET, PEER_PUBLIC_KEY env vars — CLI will need to accept these or read from a config file
- State machine error state requires explicit reset (error→idle transition) — CLI should handle this gracefully

---
*Phase: 02-tunnel-connectivity-nat-traversal*
*Completed: 2026-03-11*
