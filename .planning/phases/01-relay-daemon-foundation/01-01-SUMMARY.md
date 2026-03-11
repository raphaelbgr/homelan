---
phase: 01-relay-daemon-foundation
plan: "01"
subsystem: infra
tags: [pnpm, typescript, monorepo, wireguard, ipc, sse]

# Dependency graph
requires: []
provides:
  - pnpm monorepo with workspace resolution (packages/*)
  - "@homelan/shared TypeScript package with all inter-package type contracts"
  - "Relay API types: RegisterRequest, RegisterResponse, LookupResponse, RelayError"
  - "Daemon domain types: ConnectionState, TunnelMode, WireguardKeypair, PeerInfo, LanDevice, HostInfo, DaemonStatus"
  - "IPC/SSE types: IpcStatusResponse, IpcDevicesResponse, IpcConnectRequest, IpcSwitchModeRequest, SseEvent<T>, SseEventType"
  - "Skeleton package.json files for relay, daemon, cli, gui"
affects:
  - 01-relay-daemon-foundation
  - 02-tunnel-nat-cli
  - 03-mode-switching-discovery
  - 04-desktop-gui
  - 05-onboarding-fallback

# Tech tracking
tech-stack:
  added:
    - pnpm workspaces
    - TypeScript 5.x (strict, NodeNext/ES2022)
    - vitest 1.x
    - eslint 8.x with @typescript-eslint/parser and plugin
  patterns:
    - "Monorepo: plain pnpm workspaces (no Turborepo/Nx)"
    - "All inter-package contracts defined in @homelan/shared before implementation"
    - "Private key never exposed in WireguardKeypair interface (omitted by design)"
    - "SseEvent<T> generic discriminated union for type-safe SSE events"
    - "IpcStatusResponse = DaemonStatus (single source of truth via type alias)"

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - tsconfig.base.json
    - .eslintrc.base.js
    - .gitignore
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/shared/src/types/relay.ts
    - packages/shared/src/types/daemon.ts
    - packages/shared/src/types/ipc.ts
    - packages/shared/src/types/ipc.test.ts
    - packages/relay/package.json
    - packages/daemon/package.json
    - packages/cli/package.json
    - packages/gui/package.json
  modified: []

key-decisions:
  - "Plain pnpm workspaces chosen over Turborepo/Nx — simpler for this project size"
  - "WireguardKeypair has no privateKey field — private key never leaves daemon, enforced at type level"
  - "IpcStatusResponse is a type alias for DaemonStatus — daemon is single source of truth, no separate IPC schema"
  - "tsconfig.base.json uses NodeNext module resolution (required for ESM .js imports in types)"
  - "Test excluded from tsconfig.json build but included in vitest run — clean dist output"

patterns-established:
  - "Type-first: all cross-package contracts defined in @homelan/shared before any implementation begins"
  - "ESM-only: all packages use type=module and .js extensions in imports"
  - "Strict TypeScript: exactOptionalPropertyTypes + noUncheckedIndexedAccess enforced across all packages"
  - "Security by omission: sensitive fields absent from interfaces rather than marked optional"

requirements-completed:
  - DAEM-04
  - DAEM-05
  - DAEM-06
  - AUTH-01

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 1 Plan 01: Monorepo Bootstrap & Shared Type Contracts Summary

**pnpm monorepo with strict TypeScript ES2022/NodeNext config and @homelan/shared exporting all relay, daemon IPC, and SSE type contracts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T19:09:58Z
- **Completed:** 2026-03-11T19:13:23Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- pnpm workspace bootstrapped with 5 packages (shared, relay, daemon, cli, gui), all resolving correctly
- @homelan/shared compiled with zero TypeScript errors in strict mode (ES2022/NodeNext)
- All 17 type exports across 3 files verified: relay API, daemon domain, IPC/SSE contracts
- 6 type-level vitest tests pass, enforcing: no privateKey on WireguardKeypair, TunnelMode union, ConnectionState union, SseEvent generics, IpcStatusResponse = DaemonStatus equivalence

## Task Commits

Each task was committed atomically:

1. **Task 1: Monorepo scaffold with pnpm workspaces** - `15e1cdb` (chore)
2. **Task 2: Shared types package** - `6873f1e` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified
- `package.json` - Root monorepo with build/test/typecheck scripts and dev deps
- `pnpm-workspace.yaml` - Workspace definition (packages/*)
- `tsconfig.base.json` - Strict TypeScript ES2022/NodeNext base config
- `.eslintrc.base.js` - Base ESLint config with @typescript-eslint ruleset
- `.gitignore` - node_modules, dist, .env, logs, pnpm-lock.yaml
- `packages/shared/src/types/relay.ts` - RegisterRequest, RegisterResponse, LookupResponse, RelayError
- `packages/shared/src/types/daemon.ts` - ConnectionState, TunnelMode, WireguardKeypair (no privateKey), PeerInfo, LanDevice, HostInfo, DaemonStatus
- `packages/shared/src/types/ipc.ts` - IpcStatusResponse, IpcDevicesResponse, IpcConnectRequest/Response, IpcSwitchModeRequest/Response, SseEvent<T>, SseEventType, IpcError
- `packages/shared/src/types/ipc.test.ts` - 6 type-level contract tests
- `packages/shared/src/index.ts` - Re-exports all types from the 3 type files
- `packages/relay/package.json` - Stub with @homelan/shared workspace dependency
- `packages/daemon/package.json` - Stub with @homelan/shared workspace dependency
- `packages/cli/package.json` - Stub (Phase 2 implementation)
- `packages/gui/package.json` - Stub (Phase 4 implementation)

## Decisions Made
- Plain pnpm workspaces over Turborepo/Nx — sufficient complexity level for this project
- NodeNext module resolution required for ESM .js imports in TypeScript source files
- WireguardKeypair interface intentionally omits privateKey — enforced at type level, not runtime
- Test files excluded from tsconfig.json build target to keep dist/ clean, but vitest picks them up independently

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All downstream packages (relay, daemon, cli, gui) can import from @homelan/shared with zero configuration changes
- packages/relay and packages/daemon are ready for Plan 01-02 (relay server implementation) and Plan 01-03 (daemon core)
- Type contracts are the single source of truth — no type drift risk between packages
- dist/ output for @homelan/shared includes .js, .d.ts, and .map files for IDE support

---
*Phase: 01-relay-daemon-foundation*
*Completed: 2026-03-11*
