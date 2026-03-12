---
phase: 05-onboarding-fallback-reliability
plan: "01"
subsystem: auth
tags: [express, wireguard, invite, pairing, types, relay, shared]

# Dependency graph
requires:
  - phase: 01-relay-daemon-foundation
    provides: PeerStore interface (upsert/findByPublicKey), RelayConfig, relay app/routes pattern
  - phase: 02-tunnel-nat-cli
    provides: ConnectionProgress type, NatTraversalConfig

provides:
  - POST /invite endpoint with Bearer auth and 15-min TTL tokens
  - POST /pair endpoint with single-use token enforcement and client key storage
  - InviteStore (Map<token, InviteEntry>) shared across invite/pair routers
  - ConnectionProgress union extended with trying_ddns step
  - InviteResponse, PairRequest, PairResponse types in @homelan/shared
  - serverPublicKey and relayUrl fields added to RelayConfig

affects: [05-02-ddns-fallback, 05-03-onboarding-ui, 05-04-skill]

# Tech tracking
tech-stack:
  added: [node:crypto (randomBytes — already built-in)]
  patterns:
    - inviteRouter/pairRouter follow same (store, config, inviteStore) parameter pattern as registerRouter
    - createApp() accepts optional InviteStore for test injection (same pattern as PeerStore injection)
    - InviteStore exported from invite.ts and re-used by pair.ts (type sharing via import)

key-files:
  created:
    - packages/relay/src/routes/invite.ts
    - packages/relay/src/routes/invite.test.ts
    - packages/relay/src/routes/pair.ts
    - packages/relay/src/routes/pair.test.ts
    - packages/shared/src/types/nat-relay.test.ts
  modified:
    - packages/relay/src/app.ts
    - packages/relay/src/config.ts
    - packages/shared/src/types/nat.ts
    - packages/shared/src/types/relay.ts

key-decisions:
  - "serverPublicKey in RelayConfig is the HOME SERVER's WireGuard key, not relay's (relay is discovery-only; no WireGuard interface)"
  - "InviteStore is Map<string, InviteEntry> passed as optional param to createApp() for test isolation without mocking"
  - "Single-use enforcement: inviteStore.delete(token) before sending response to prevent race condition re-use"
  - "token is 32 randomBytes as hex (64 chars), not base64, to avoid URL-encoding issues in homelan:// deep links"
  - "relayUrl and serverPublicKey in RelayConfig default to empty string in dev (no env var required for unit tests)"

patterns-established:
  - "Shared store passed as optional parameter to createApp() for test injection — avoids module-level mocking"
  - "Route handlers share InviteStore type via import from invite.ts — no duplication"

requirements-completed: [AUTH-02]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 5 Plan 01: Relay Invite/Pair Routes Summary

**POST /invite and POST /pair endpoints for WireGuard key exchange onboarding, with single-use 15-min tokens and trying_ddns ConnectionProgress step added to shared types**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-12T02:01:58Z
- **Completed:** 2026-03-12T02:06:46Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added trying_ddns to ConnectionProgress union in @homelan/shared (between trying_relay and connected)
- Added InviteResponse, PairRequest, PairResponse interfaces to @homelan/shared/types/relay.ts
- Built POST /invite: requires Bearer relay secret, generates 64-char hex token, stores with 15-min TTL, returns homelan:// deep link
- Built POST /pair: validates token, enforces single-use (delete before respond), upserts client WireGuard key into PeerStore, returns server public key + relay URL
- Extended RelayConfig with serverPublicKey and relayUrl (env: RELAY_SERVER_PUBLIC_KEY, RELAY_URL)
- 180 total tests passing (shared: 12, relay: 34, daemon: 130, cli: 4) — 18 net new tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared types with trying_ddns and invite/pair contracts** - `8de8f1e` (pre-committed as part of phase 5 planning)
2. **Task 2: Relay invite and pair routes with single-use token store** - `cb5952c` (feat)

## Files Created/Modified
- `packages/shared/src/types/nat.ts` - Added trying_ddns to ConnectionProgress union
- `packages/shared/src/types/relay.ts` - Added InviteResponse, PairRequest, PairResponse interfaces
- `packages/shared/src/types/nat-relay.test.ts` - Type-level tests for new types (6 tests)
- `packages/relay/src/routes/invite.ts` - POST /invite route with Bearer auth and token generation
- `packages/relay/src/routes/invite.test.ts` - 6 tests for invite route (happy path, auth, token format, expiry, relayUrl)
- `packages/relay/src/routes/pair.ts` - POST /pair route with token validation, single-use enforcement, peer upsert
- `packages/relay/src/routes/pair.test.ts` - 6 tests for pair route (happy path, single-use, invalid/expired token, bad key, peer store)
- `packages/relay/src/app.ts` - Registered /invite and /pair routes with shared InviteStore
- `packages/relay/src/config.ts` - Added serverPublicKey and relayUrl to RelayConfig schema

## Decisions Made
- serverPublicKey in RelayConfig is the HOME SERVER's WireGuard key (relay is discovery-only, no WireGuard interface of its own)
- InviteStore is Map<string, InviteEntry> passed as optional param to createApp() for test isolation without module mocking
- Single-use enforcement: inviteStore.delete(token) before sending response to prevent race condition re-use
- Token is 32 randomBytes as hex (64 chars), not base64, to avoid URL-encoding issues in homelan:// deep links
- relayUrl and serverPublicKey default to empty string in dev (no env var required for unit tests)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 types (nat.ts, relay.ts, nat-relay.test.ts) were already committed in the phase 5 planning commit (8de8f1e). Verified correctness and proceeded to Task 2 without re-committing.

## User Setup Required
Two optional environment variables for production deployments:
- `RELAY_SERVER_PUBLIC_KEY` — The home server's WireGuard public key (returned in /pair response)
- `RELAY_URL` — The relay's public URL (included in invite URLs and pair responses)

Both default to empty string in development/tests.

## Next Phase Readiness
- Relay now provides the server-side foundation for AUTH-02 key exchange onboarding
- POST /invite + POST /pair ready for client-side integration in Phase 5 Plan 02+
- trying_ddns ConnectionProgress step ready for DDNS fallback implementation

---
*Phase: 05-onboarding-fallback-reliability*
*Completed: 2026-03-12*
