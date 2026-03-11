---
phase: 02-tunnel-connectivity-nat-traversal
plan: 01
subsystem: nat
tags: [stun, udp, dgram, relay, fetch, nat-traversal, rfc5389]

# Dependency graph
requires:
  - phase: 01-relay-daemon-foundation
    provides: "LookupResponse type from @homelan/shared; relay server POST /register and GET /lookup endpoints"
provides:
  - "resolveExternalEndpoint() — raw UDP STUN client (RFC 5389 XOR-MAPPED-ADDRESS) via node:dgram"
  - "RelayClient class — register/lookup/startAutoRenew via native fetch"
  - "StunResult, ConnectionProgress, NatTraversalConfig types in @homelan/shared"
affects:
  - 02-02-hole-punching
  - 02-03-daemon-connect

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw UDP via node:dgram for STUN (no external stun library dependency)"
    - "Native fetch (Node.js 22 built-in) for HTTP relay client (no node-fetch)"
    - "TDD RED → GREEN pattern: tests written first against non-existent module, verified to fail, then implementation written to pass"

key-files:
  created:
    - packages/shared/src/types/nat.ts
    - packages/daemon/src/nat/stun.ts
    - packages/daemon/src/nat/stun.test.ts
    - packages/daemon/src/nat/relayClient.ts
    - packages/daemon/src/nat/relayClient.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Raw dgram STUN client with no external STUN library — confirmed by CONTEXT.md 'Claude's Discretion' note; keeps zero new npm dependencies"
  - "Native fetch (Node.js 22 built-in) for RelayClient — no node-fetch dependency needed"
  - "lookup() does NOT encodeURIComponent the public key — relay server registers and looks up keys verbatim; encoding breaks matching"
  - "startAutoRenew() catches and logs errors silently — daemon stays running even if relay is temporarily unreachable"

patterns-established:
  - "NAT module pattern: packages/daemon/src/nat/ for all NAT traversal code"
  - "StunError and RelayClientError both extend Error with name set — consistent with WireGuardError and StateTransitionError pattern"
  - "Auto-renew interval = ttlSeconds/2 * 1000 ms — registered as a shared understanding for relay client callers"

requirements-completed: [NAT-01, NAT-02, NAT-04, NAT-05]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 02 Plan 01: NAT Discovery Layer Summary

**Pure-Node.js STUN client (RFC 5389 XOR-MAPPED-ADDRESS via node:dgram) + RelayClient (native fetch register/lookup/auto-renew) with zero new npm dependencies**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T20:04:55Z
- **Completed:** 2026-03-11T20:08:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pure Node.js STUN client implementing RFC 5389 XOR-MAPPED-ADDRESS parsing using node:dgram — no external STUN library
- RelayClient using Node.js 22 built-in fetch — register with Bearer auth, peer lookup, TTL/2 auto-renew with silent error handling
- StunResult, ConnectionProgress, NatTraversalConfig types added to @homelan/shared and exported
- All 69 daemon tests pass (up from 61): 3 STUN + 5 relay client tests added; 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared NAT types + STUN client** - `fadd219` (feat)
2. **Task 2: Relay HTTP client** - `15192d4` (feat)

## Files Created/Modified
- `packages/shared/src/types/nat.ts` - StunResult, ConnectionProgress, NatTraversalConfig type definitions
- `packages/shared/src/index.ts` - Re-exports nat types (added `export * from "./types/nat.js"`)
- `packages/daemon/src/nat/stun.ts` - resolveExternalEndpoint(), StunError class — RFC 5389 UDP STUN client
- `packages/daemon/src/nat/stun.test.ts` - 3 tests: mock server response, timeout, XOR math verification
- `packages/daemon/src/nat/relayClient.ts` - RelayClient class with register(), lookup(), startAutoRenew()
- `packages/daemon/src/nat/relayClient.test.ts` - 5 tests: POST body/headers, 200 lookup, 404 error, auto-renew interval

## Decisions Made
- **Raw dgram STUN (no external library):** Confirmed by CONTEXT.md "Claude's Discretion" note — keeps zero new npm dependencies
- **Native fetch for HTTP:** Node.js 22 LTS ships `fetch` built-in; eliminates node-fetch
- **No encodeURIComponent on lookup URL:** Public keys are base64 with `=` padding; encoding breaks server-side matching
- **Silent auto-renew errors:** Daemon must stay running even during temporary relay outages; errors are logged but not thrown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed URL encoding on public key in lookup()**
- **Found during:** Task 2 (relay client GREEN phase)
- **Issue:** Initial implementation used `encodeURIComponent(peerPublicKey)` which encoded `=` signs in base64 keys to `%3D`, causing test assertion to fail (URL didn't match expected string)
- **Fix:** Removed `encodeURIComponent` — keys are passed verbatim; relay server registered them verbatim
- **Files modified:** packages/daemon/src/nat/relayClient.ts
- **Verification:** All 5 relay client tests pass
- **Committed in:** 15192d4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Necessary fix for correct URL construction. No scope creep.

## Issues Encountered
- `encodeURIComponent` on lookup path caused test failure — fixed inline during GREEN phase (see Deviations above)

## User Setup Required
None - no external service configuration required. STUN and relay client use existing relay server from Phase 1.

## Next Phase Readiness
- `resolveExternalEndpoint()` is ready for use in `Daemon.connect()` (plan 02-03)
- `RelayClient` is ready for use in `Daemon.connect()` for peer discovery
- Both modules tested in isolation; integration in hole punching (plan 02-02) and connect orchestration (plan 02-03) can proceed
- No blockers

## Self-Check: PASSED

- `packages/shared/src/types/nat.ts` - FOUND
- `packages/daemon/src/nat/stun.ts` - FOUND
- `packages/daemon/src/nat/stun.test.ts` - FOUND
- `packages/daemon/src/nat/relayClient.ts` - FOUND
- `packages/daemon/src/nat/relayClient.test.ts` - FOUND
- `02-01-SUMMARY.md` - FOUND
- Commit `fadd219` (Task 1) - FOUND
- Commit `15192d4` (Task 2) - FOUND

---
*Phase: 02-tunnel-connectivity-nat-traversal*
*Completed: 2026-03-11*
