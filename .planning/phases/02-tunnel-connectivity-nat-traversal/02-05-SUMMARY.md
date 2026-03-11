---
phase: 02-tunnel-connectivity-nat-traversal
plan: 05
subsystem: cli
tags: [cli, commander, ipc, ora, typescript, tdd]

# Dependency graph
requires:
  - phase: 02-03
    provides: IPC /connect, /disconnect, /status endpoints on daemon 127.0.0.1:30001
  - phase: 01-04
    provides: DaemonStatus type, IPC server structure

provides:
  - "packages/cli/src/ipcClient.ts: IpcClient class — get<T>(), post<T>(), isRunning() using native fetch"
  - "packages/cli/src/commands/connect.ts: connectCommand() with spinner/polling, exit codes 0/1/2/3, --retry"
  - "packages/cli/src/commands/disconnect.ts: disconnectCommand() with --json and exit codes"
  - "packages/cli/src/commands/status.ts: statusCommand() with JSON default and --human table"
  - "packages/cli/src/index.ts: Commander.js homelan entry point with all three commands"

affects:
  - 02-06 (if any further CLI integration testing)
  - 04-01 (GUI uses same IPC routes; CLI provides pattern reference)
  - 05-02 (Claude Code skill uses CLI commands)

# Tech tracking
tech-stack:
  added:
    - "commander@^12.1.0 — CLI framework with subcommands, option parsing, auto-help"
    - "ora@^8.0.1 — ESM-native spinner for connect progress display"
  patterns:
    - "IpcClient is the only tested unit; command handlers are thin glue code delegating to IpcClient"
    - "connect uses POST /connect then polls GET /status every 500ms — avoids SSE complexity in CLI"
    - "isRunning() catches all fetch errors as false (not running) — simple, safe sentinel"
    - "All commands: check isRunning() first, exit(3) if daemon absent"

key-files:
  created:
    - packages/cli/package.json (updated with deps + bin)
    - packages/cli/tsconfig.json
    - packages/cli/src/ipcClient.ts
    - packages/cli/src/ipcClient.test.ts
    - packages/cli/src/commands/connect.ts
    - packages/cli/src/commands/disconnect.ts
    - packages/cli/src/commands/status.ts
    - packages/cli/src/index.ts
  modified: []

key-decisions:
  - "ora@^8 chosen for spinner (ESM-native, zero transitive deps, standard for Node.js CLIs)"
  - "connect polls /status every 500ms after POST /connect instead of SSE — SSE is for GUI (Phase 4)"
  - "IpcClientError.statusCode is null when connection refused (not an HTTP error)"
  - "status outputs JSON by default (no flag needed); --human activates table format"

requirements-completed: [TUNL-02, TUNL-03, CLI-01, CLI-02, CLI-03, CLI-06, CLI-07]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 2 Plan 5: CLI Package Summary

**Commander.js CLI with IpcClient thin wrapper — connect (spinner + 500ms polling), disconnect, status (JSON default + --human table), exit codes 0/1/2/3, --retry on connect, zero TypeScript errors**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T20:22:25Z
- **Completed:** 2026-03-11T20:26:00Z
- **Tasks:** 2
- **Files created:** 8

## Accomplishments
- Built IpcClient class using native fetch (Node.js 22): get<T>(), post<T>(), isRunning() with ECONNREFUSED detection
- IpcClientError extends Error with statusCode: number | null (null for connection refused, HTTP code otherwise)
- connectCommand(): daemon check, ora spinner, POST /connect, 500ms polling loop, --retry, exit codes 0/1/2/3
- disconnectCommand(): daemon check, POST /disconnect, --json flag, exit codes 0/1/3
- statusCommand(): GET /status, JSON by default, --human prints aligned key-value table with uptime formatting
- index.ts: Commander.js entry with name/version/description, #!/usr/bin/env node shebang, addCommand x3
- 4 IpcClient tests passing, TypeScript build zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: IPC client + CLI scaffold** - `ef780e2` (feat) — TDD: RED→GREEN, package.json + tsconfig.json + ipcClient
2. **Task 2: connect, disconnect, status commands + CLI entry point** - `106228a` (feat)

_Note: Task 1 was TDD — tests written first (RED), then implementation (GREEN)_

## Files Created/Modified
- `packages/cli/package.json` - Added commander, ora deps; bin entry homelan->dist/index.js; start script
- `packages/cli/tsconfig.json` - Extends ../../tsconfig.base.json, outDir ./dist, rootDir ./src
- `packages/cli/src/ipcClient.ts` - IpcClient + IpcClientError with native fetch
- `packages/cli/src/ipcClient.test.ts` - 4 vitest tests covering all public API behaviors
- `packages/cli/src/commands/connect.ts` - Full connect flow with spinner, polling, retry, exit codes
- `packages/cli/src/commands/disconnect.ts` - Disconnect with daemon check and exit codes
- `packages/cli/src/commands/status.ts` - Status with JSON default and --human table
- `packages/cli/src/index.ts` - CLI entry point with shebang

## Decisions Made
- ora@^8 chosen for spinner: ESM-native, zero additional transitive dependencies, de-facto standard for Node CLIs
- connect command polls GET /status every 500ms after POST /connect — simpler than SSE parsing; SSE is reserved for GUI (Phase 4)
- IpcClientError.statusCode is null when connection is refused (not an HTTP error at all)
- status command outputs JSON by default with no flag required; --human activates formatted table

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- packages/cli/src/ipcClient.ts: FOUND
- packages/cli/src/commands/connect.ts: FOUND
- packages/cli/src/commands/disconnect.ts: FOUND
- packages/cli/src/commands/status.ts: FOUND
- packages/cli/src/index.ts: FOUND
- packages/cli/tsconfig.json: FOUND

Commits verified:
- ef780e2 (Task 1): FOUND
- 106228a (Task 2): FOUND

Tests: 4/4 passing
Build: zero TypeScript errors
homelan --help: shows connect, disconnect, status with correct options
Shebang: #!/usr/bin/env node on line 1 of dist/index.js

## Next Phase Readiness
- CLI package complete — Phase 2 is now fully done
- connect/disconnect/status commands ready for end-to-end testing once daemon is running
- Claude Code skill (Phase 5) can use `homelan connect`, `homelan status`, `homelan disconnect` directly

---
*Phase: 02-tunnel-connectivity-nat-traversal*
*Completed: 2026-03-11*
