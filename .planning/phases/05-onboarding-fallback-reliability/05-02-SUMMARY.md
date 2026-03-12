---
phase: 05-onboarding-fallback-reliability
plan: "02"
subsystem: daemon
tags: [wireguard, ipc, history, ddns, pairing, json-lines, dns-fallback]

# Dependency graph
requires:
  - phase: 05-onboarding-fallback-reliability
    provides: "05-01: ConnectionProgress.trying_ddns, PairRequest/PairResponse types, relay /invite and /pair endpoints"
  - phase: 02-tunnel-nat-cli
    provides: "RelayClient, Daemon.connect() with relay fallback, IPC server pattern"
provides:
  - "HistoryLogger: append-only JSON Lines at ~/.homelan/history.jsonl, 1000-entry cap"
  - "RelayClient.pair(inviteUrl): parses homelan:// URL, POSTs to relay /pair, returns PairResponse"
  - "Daemon DDNS fallback: emits trying_ddns, resolves ddnsHostname after relay fails"
  - "Daemon history logging: connect/disconnect/mode_switch/error entries on state transitions"
  - "POST /pair IPC route: validates inviteUrl, 400/409/500 error handling"
  - "GET /history IPC route: returns last N entries with configurable limit (default 20, max 100)"
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSON Lines (jsonl) for append-only history — sync fs ops for simplicity and predictability"
    - "homelan:// custom scheme parsed via URL constructor (works with custom schemes)"
    - "DnsResolverFn injectable for DDNS resolution — enables test isolation without mocking dns module"
    - "History logging is best-effort (try/catch around all logger.append calls) — never blocks connection"

key-files:
  created:
    - packages/daemon/src/history/logger.ts
    - packages/daemon/src/history/logger.test.ts
    - packages/daemon/src/ipc/routes/pair.ts
    - packages/daemon/src/ipc/routes/history.ts
  modified:
    - packages/daemon/src/nat/relayClient.ts
    - packages/daemon/src/nat/relayClient.test.ts
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/daemon-connect.test.ts
    - packages/daemon/src/ipc/server.ts
    - packages/daemon/src/ipc/server.test.ts

key-decisions:
  - "HistoryLogger uses synchronous fs ops (appendFileSync, readFileSync) — simpler, no async error handling, sufficient for low-frequency history writes"
  - "DDNS fallback uses first resolved IP, extracting peer port from original peer endpoint"
  - "Daemon.pair() stores both serverPublicKey and relayUrl in keychain for future connect() calls"
  - "historyLogger exposed as public getter on Daemon for historyRouter access without separate injection"
  - "DnsResolverFn injectable (default: dns.promises.resolve4) keeps daemon testable without mock modules"
  - "POST /pair returns 409 when state is not idle — prevents pairing while actively connected"

patterns-established:
  - "Best-effort logging pattern: wrap logger.append() in try/catch — errors never surface to callers"
  - "Injectable DNS resolver follows existing holePunchFn/lanScanner injection pattern"

requirements-completed: [AUTH-02]

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 05 Plan 02: DDNS Fallback, History Logging, Pair/History IPC Routes Summary

**Daemon extended with DDNS fallback tier, append-only JSON Lines history (1000-entry cap), RelayClient.pair() for homelan:// invite exchange, and POST /pair + GET /history IPC routes**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T02:10:05Z
- **Completed:** 2026-03-12T02:22:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built HistoryLogger with JSON Lines storage, automatic 1000-entry trimming, injectable file path for test isolation
- Added RelayClient.pair(inviteUrl) parsing homelan:// custom scheme URL, POSTing to relay /pair, returning PairResponse
- Extended Daemon.connect() with DDNS fallback: after relay fails, resolve ddnsHostname via injectable dns resolver, emit trying_ddns
- Wired history logging on connect/disconnect/mode_switch/error state transitions (best-effort, never blocks tunnel)
- Created POST /pair IPC route (400 missing URL, 409 not idle, 500 relay error) and GET /history IPC route (limit param, max 100)
- 29 new tests added; 159 total daemon tests passing (up from 130)

## Task Commits

Each task was committed atomically:

1. **Task 1: HistoryLogger + RelayClient.pair() + DDNS fallback + history logging** - `1e6af05` (feat)
2. **Task 2: IPC /pair and /history routes** - `33c565d` (feat)

## Files Created/Modified
- `packages/daemon/src/history/logger.ts` - HistoryLogger class: JSON Lines append, getEntries(), 1000-cap trimming
- `packages/daemon/src/history/logger.test.ts` - 9 tests: append, getEntries, 1000-cap, custom path
- `packages/daemon/src/nat/relayClient.ts` - Added pair(inviteUrl) method
- `packages/daemon/src/nat/relayClient.test.ts` - 4 tests: pair happy path, invalid URL, 401, missing token
- `packages/daemon/src/daemon.ts` - DDNS fallback in connect(), history logging, historyLogger getter, pair() method, DnsResolverFn
- `packages/daemon/src/daemon-connect.test.ts` - 10 new tests: 3 DDNS + 4 history logging
- `packages/daemon/src/ipc/routes/pair.ts` - POST /pair route
- `packages/daemon/src/ipc/routes/history.ts` - GET /history route
- `packages/daemon/src/ipc/server.ts` - Registered /pair and /history routes
- `packages/daemon/src/ipc/server.test.ts` - 9 new IPC tests for /pair and /history

## Decisions Made
- HistoryLogger uses synchronous fs ops — simpler for low-frequency logging; never blocks async daemon operations
- DDNS fallback uses first resolved IP, extracting peer port from original peer endpoint (consistent with relay endpoint pattern)
- historyLogger exposed as public getter on Daemon — avoids separate HistoryLogger injection into IPC server
- DnsResolverFn injectable (default: dns.promises.resolve4) keeps daemon testable without module mocking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `afterEach` was not imported in daemon-connect.test.ts — auto-fixed by adding to the vitest import (Rule 3 - Blocking).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AUTH-02 daemon side complete: pair flow, history logging, DDNS fallback all implemented
- POST /pair and GET /history IPC routes ready for CLI consumption (05-03)
- Daemon.historyLogger getter available for GUI display (Phase 4)
- DDNS fallback requires RELAY_SECRET env var for relay client factory; ddnsHostname injectable via DaemonOptions

## Self-Check: PASSED

All files exist and all commits verified:
- FOUND: packages/daemon/src/history/logger.ts
- FOUND: packages/daemon/src/ipc/routes/pair.ts
- FOUND: packages/daemon/src/ipc/routes/history.ts
- FOUND: commit 1e6af05 (Task 1)
- FOUND: commit 33c565d (Task 2)

---
*Phase: 05-onboarding-fallback-reliability*
*Completed: 2026-03-12*
