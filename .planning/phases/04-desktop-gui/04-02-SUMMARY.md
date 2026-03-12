---
phase: "04-desktop-gui"
plan: "02"
subsystem: gui
tags: [react, hooks, sse, ipc, tailwind, dashboard]
dependency_graph:
  requires: ["04-01"]
  provides: ["GUI-02", "GUI-03", "GUI-04", "GUI-05", "GUI-06"]
  affects: ["packages/gui/src"]
tech_stack:
  added: []
  patterns: ["SSE EventSource with auto-reconnect", "React hook IPC client", "Tailwind utility composition via cn()"]
key_files:
  created:
    - packages/gui/src/hooks/useDaemon.ts
    - packages/gui/src/hooks/useSse.ts
    - packages/gui/src/components/ConnectButton.tsx
    - packages/gui/src/components/ModeToggle.tsx
    - packages/gui/src/components/StatusSection.tsx
    - packages/gui/src/components/DeviceList.tsx
    - packages/gui/src/components/ErrorBanner.tsx
    - packages/gui/src/components/ProgressLog.tsx
  modified:
    - packages/gui/src/App.tsx
decisions:
  - "DaemonError union type maps raw fetch errors to human-readable user-facing messages"
  - "useSse handlers are stable via useCallback to avoid EventSource re-subscribe on every render"
  - "StatusSection uses actual DaemonStatus fields (latencyMs/uptimeMs) not plan doc aliases"
metrics:
  duration: "8 min"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_changed: 9
---

# Phase 4 Plan 02: Dashboard UI Components Summary

**One-liner:** React dashboard wired to daemon IPC and SSE — connect button, mode toggle, live status, device list, progress log, and error banner in a compact Mullvad-style layout.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Daemon hooks (useDaemon + useSse) | a5709a1 | useDaemon.ts, useSse.ts |
| 2 | UI components + App wiring | 89783e3 | 7 component/app files |

## What Was Built

**useDaemon.ts** — React hook wrapping daemon HTTP IPC at `localhost:30001`. Provides `connect()`, `disconnect()`, `switchMode()`, `fetchStatus()` with loading/error state. `DaemonError` union type maps raw fetch exceptions to actionable user messages (`daemon_not_running`, `relay_unreachable`, `connect_failed`, `unknown`).

**useSse.ts** — React hook subscribing to `GET /events` SSE stream. Listens for `state_changed`, `mode_changed`, `devices_updated`, `connection_progress`, and `error_event`. EventSource closes on unmount. Auto-reconnects via browser EventSource behavior on connection loss.

**ConnectButton** — Full-width hero button. Color-coded by `ConnectionState`: gray (idle), yellow (connecting/disconnecting), green (connected), red (error). Disabled + spinner while busy.

**ModeToggle** — Two-button toggle (LAN Only / Full Gateway) with descriptions. Disabled via `pointer-events-none` + opacity when not connected.

**StatusSection** — 3-column grid showing state, latencyMs, uptimeMs with `formatUptime()` for human-readable h/m/s display.

**DeviceList** — Scrollable list of LAN devices with IP, hostname, and deviceType columns.

**ErrorBanner** — Dismissible red banner with mapped human-readable messages. X button calls `dismissError()`.

**ProgressLog** — Step-by-step connection progress display with step label mapping.

**App.tsx** — Full wiring: `useDaemon` + `useSse` together, progressive disconnect step timeout (3s after connect/idle), mode pre-selection while disconnected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DaemonStatus field names differ from plan documentation**
- **Found during:** Task 2 typecheck
- **Issue:** Plan docs showed `latency?: number` and `uptime?: number` but actual `@homelan/shared` has `latencyMs: number | null` and `uptimeMs: number`
- **Fix:** Updated StatusSection.tsx to use `latencyMs`/`uptimeMs`; adjusted formatUptime signature from optional to required
- **Files modified:** packages/gui/src/components/StatusSection.tsx
- **Commit:** 89783e3

**2. [Rule 1 - Bug] LanDevice fields differ from plan documentation**
- **Found during:** Task 2 typecheck
- **Issue:** Plan docs showed `mac: string` and `type?: string` but actual type has only `ip`, `hostname: string | null`, `deviceType: string | null`
- **Fix:** Updated DeviceList.tsx to use `hostname ?? ip` (no mac field) and `deviceType` (not type)
- **Files modified:** packages/gui/src/components/DeviceList.tsx
- **Commit:** 89783e3

## Self-Check

Files exist:
- packages/gui/src/hooks/useDaemon.ts — FOUND
- packages/gui/src/hooks/useSse.ts — FOUND
- packages/gui/src/components/ConnectButton.tsx — FOUND
- packages/gui/src/components/ModeToggle.tsx — FOUND
- packages/gui/src/components/StatusSection.tsx — FOUND
- packages/gui/src/components/DeviceList.tsx — FOUND
- packages/gui/src/components/ErrorBanner.tsx — FOUND
- packages/gui/src/components/ProgressLog.tsx — FOUND
- packages/gui/src/App.tsx — FOUND

Commits: a5709a1, 89783e3 — FOUND

TypeScript: zero errors
Tests: 162/162 passing (all prior tests unaffected)

## Self-Check: PASSED
