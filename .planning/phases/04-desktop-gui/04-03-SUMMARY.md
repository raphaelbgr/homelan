---
phase: "04"
plan: "03"
subsystem: gui
tags: [tauri, tray, rust, react, typescript]
dependency_graph:
  requires: ["04-02"]
  provides: ["GUI-07"]
  affects: ["packages/gui/src-tauri/src/lib.rs", "packages/gui/src/tray.ts"]
tech_stack:
  added: ["tauri-plugin-tray 2.x"]
  patterns: ["minimize-to-tray", "Tauri event bridge (emit/listen)", "tray context menu"]
key_files:
  created:
    - packages/gui/src/tray.ts
  modified:
    - packages/gui/src-tauri/Cargo.toml
    - packages/gui/src-tauri/tauri.conf.json
    - packages/gui/src-tauri/src/lib.rs
    - packages/gui/src/main.tsx
decisions:
  - "TrayIconBuilder::with_id used over config-only tray — gives full event control in Rust"
  - "on_window_event CloseRequested intercept hides window, not quits — tray Quit is the only exit path"
  - "Frontend tray listeners fire-and-forget with silent catch — daemon may not be running when tray clicked"
metrics:
  duration: "5 min"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_changed: 5
---

# Phase 4 Plan 03: System Tray Integration Summary

System tray icon with minimize-to-tray, left-click window toggle, and right-click context menu (Connect/Disconnect/Switch Mode/Quit) wired via Tauri 2.x event bridge to daemon IPC.

## What Was Built

- **Cargo.toml**: Added `tauri-plugin-tray = "2"` and `tray-icon` feature flag to tauri dependency
- **tauri.conf.json**: Added `trayIcon` config block with `id`, `iconPath`, `iconAsTemplate`, `menuOnLeftClick: false`
- **lib.rs**: Full `TrayIconBuilder` implementation — context menu with 5 items, `on_menu_event` emitting Tauri events, `on_tray_icon_event` for left-click window toggle, `on_window_event` CloseRequested handler for minimize-to-tray
- **tray.ts**: `registerTrayListeners()` — listens to `tray-connect`, `tray-disconnect`, `tray-switch-mode` events and delegates to daemon IPC via fetch
- **main.tsx**: Calls `registerTrayListeners()` after React mounts

## Verification

- TypeScript: zero errors (`pnpm --filter @homelan/gui typecheck`)
- Full test suite: 162 tests passing across all packages (`pnpm -r test`)
- Checkpoint auto-approved (auto mode)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `dcb3c2d`: feat(04-03): add Tauri tray plugin and Rust backend
- `829cea4`: feat(04-03): add frontend tray event listener

## Self-Check: PASSED

- packages/gui/src-tauri/Cargo.toml — modified (tauri-plugin-tray added)
- packages/gui/src-tauri/tauri.conf.json — modified (trayIcon config added)
- packages/gui/src-tauri/src/lib.rs — modified (full tray implementation)
- packages/gui/src/tray.ts — created
- packages/gui/src/main.tsx — modified (registerTrayListeners call added)
