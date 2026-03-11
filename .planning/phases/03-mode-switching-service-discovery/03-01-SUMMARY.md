---
phase: 03-mode-switching-service-discovery
plan: "01"
subsystem: daemon
tags: [wireguard, mode-switching, ipc, cli, sse, dns]

requires:
  - phase: 02-tunnel-connectivity-nat-traversal
    provides: Daemon.connect() with WireGuard lifecycle, DnsConfigurator, WireGuardInterface, IpcClient

provides:
  - "Daemon.switchMode(TunnelMode): Promise<void> — live AllowedIPs and DNS reconfiguration without tunnel restart"
  - "POST /switch-mode IPC endpoint — 200 on success, 400 invalid mode, 409 not connected"
  - "homelan switch-mode <mode> CLI command — validates mode, checks daemon, posts to IPC"
  - "Daemon.onModeChange() listener pattern — emits mode events to IPC SSE subscribers"

affects:
  - 03-mode-switching-service-discovery
  - 04-desktop-gui

tech-stack:
  added: []
  patterns:
    - "_modeListeners[] / onModeChange() / emitModeChange() — same pattern as _progressListeners for mode events"
    - "_wgConfig stored in Daemon after connect(), cleared on disconnect() — enables live reconfiguration without reconnect"
    - "switchMode guards on stateMachine.state === connected, no-ops on same mode"

key-files:
  created:
    - packages/cli/src/commands/switchMode.ts
  modified:
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/ipc/routes/switchMode.ts
    - packages/daemon/src/daemon.test.ts
    - packages/daemon/src/ipc/server.test.ts
    - packages/cli/src/index.ts

key-decisions:
  - "_wgConfig stored in Daemon (not WireGuardInterface) to enable peer AllowedIPs mutation without exposing internals"
  - "switchMode calls wgInterface.up() after configure() to reapply config — same as initial connect flow"
  - "DNS failure during switchMode is a warning (logs), not fatal — tunnel stays up consistent with connect() behavior"
  - "onModeChange() follows identical pattern to onProgress() — returns unsubscribe fn, private listener array"

requirements-completed:
  - TUNL-07
  - CLI-04

duration: 12min
completed: 2026-03-11
---

# Phase 3 Plan 01: Mode Switching Summary

**Live WireGuard mode switching (Full Gateway / LAN-Only) via Daemon.switchMode(), POST /switch-mode IPC endpoint, and homelan switch-mode CLI command — no tunnel restart required**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-11T17:47:00Z
- **Completed:** 2026-03-11T17:59:00Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- Implemented `Daemon.switchMode(TunnelMode)` that reconfigures WireGuard peer AllowedIPs and updates DNS without dropping the tunnel
- Replaced 501 stub in `/switch-mode` IPC route with real handler (400/409/200 responses)
- Added `homelan switch-mode <mode>` CLI command with mode validation, daemon check, and --json flag
- Added 11 new tests (7 daemon switchMode + 4 IPC route); all 125 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Daemon.switchMode() with WireGuard reconfiguration** - `d5714aa` (feat)
2. **Task 2: Wire switchMode IPC route + add switchMode CLI command** - `dceda1f` (feat)

## Files Created/Modified

- `packages/daemon/src/daemon.ts` - Added switchMode(), _wgConfig storage, _modeListeners, onModeChange(), emitModeChange()
- `packages/daemon/src/ipc/routes/switchMode.ts` - Replaced 501 stub with real POST handler
- `packages/daemon/src/daemon.test.ts` - 7 new switchMode() behavior tests
- `packages/daemon/src/ipc/server.test.ts` - 4 new /switch-mode route tests, updated MockDaemon
- `packages/cli/src/commands/switchMode.ts` - New switchModeCommand() following disconnect.ts pattern
- `packages/cli/src/index.ts` - Wired switchModeCommand into CLI program

## Decisions Made

- Stored `_wgConfig` in `Daemon` (not `WireGuardInterface`) so the daemon can mutate peer AllowedIPs without requiring a new `configure()` API on the interface — minimal surface change
- DNS failure during switchMode follows the same warning-only pattern as connect() — tunnel correctness is more important than DNS enforcement in edge cases
- `onModeChange()` follows the exact same listener pattern as `onProgress()` for consistency with existing daemon event API

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Mode switching is fully functional and tested
- `Daemon.onModeChange()` is available for the SSE events router to emit `mode_changed` events to GUI subscribers (Phase 4)
- Ready for Plan 03-02 (service/device discovery) or Plan 03-03 (end-to-end verification)

---
*Phase: 03-mode-switching-service-discovery*
*Completed: 2026-03-11*
