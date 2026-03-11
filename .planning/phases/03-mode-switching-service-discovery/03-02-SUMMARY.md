---
phase: 03-mode-switching-service-discovery
plan: "02"
subsystem: daemon
tags: [arp, lan-discovery, device-scanning, ipc, cli, polling]

requires:
  - phase: 02-tunnel-connectivity-nat-traversal
    provides: Daemon.connect()/disconnect(), WireGuardInterface, IpcClient, execFileSafe pattern

provides:
  - "parseArpTable(output, platform): parses arp -a stdout for both Windows and macOS/linux into LanDevice[]"
  - "inferDeviceType(hostname): heuristic device type matching for known home devices"
  - "resolveHostname(ip, executor): nslookup-based reverse DNS with injectable executor"
  - "scanLanDevices(executor, platform): full ARP scan + hostname enrichment + type inference"
  - "Daemon.startDeviceDiscovery()/stopDeviceDiscovery() — 30s polling loop, auto-start on connect"
  - "Daemon.getLanDevices() — returns live LanDevice[] (was stub returning [])"
  - "Daemon.onDevicesUpdate() — listener pattern for device list changes"
  - "IPC GET /devices returns real device data via getLanDevices()"
  - "homelan devices CLI command — table output (IP/Hostname/Type) and --json mode"

affects:
  - 03-mode-switching-service-discovery
  - 04-desktop-gui

tech-stack:
  added: []
  patterns:
    - "ARP table parsing via arp -a with injectable ShellExecutor (testable without real shell)"
    - "nslookup for reverse DNS enrichment on Windows (no hostname in arp -a)"
    - "Heuristic hostname matching for device type inference"
    - "Daemon polling loop: setInterval with immediate first run, JSON change detection"
    - "Commander.js table renderer: padEnd column alignment"

key-files:
  created:
    - packages/daemon/src/platform/arp.ts
    - packages/daemon/src/platform/arp.test.ts
    - packages/cli/src/commands/devices.ts
  modified:
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/daemon.test.ts
    - packages/cli/src/index.ts

decisions:
  - "Multicast IPs (224-239.x.x.x) filtered from ARP table (not real LAN devices)"
  - "isFilteredIp() helper centralizes gateway (.1), broadcast (.255), and multicast filtering"
  - "LanScannerFn injectable into Daemon constructor for unit test isolation"
  - "discoveryIntervalMs injectable (default 30s) so tests can use 0ms or large values without real timers"
  - "Device listener deduplication via JSON.stringify comparison (avoids false positives)"

metrics:
  duration_minutes: 7
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 3
  files_modified: 3
---

# Phase 3 Plan 2: LAN Device Discovery Summary

**One-liner:** ARP table parser with injectable executor + Daemon 30s polling loop + `homelan devices` CLI table command.

---

## What Was Built

### Task 1: ARP Table Parser Module (packages/daemon/src/platform/arp.ts)

- `parseArpTable(output, platform)`: Parses `arp -a` stdout for both Windows (`192.168.7.102  aa-bb-cc-dd-ee-ff  dynamic`) and macOS (`mac-mini.local (192.168.7.102) at aa:bb:cc:dd:ee:ff`) formats
- Filters: gateway (.1), broadcast (.255), multicast (224-239.x.x.x), incomplete entries (macOS `(incomplete)`)
- `inferDeviceType(hostname)`: Heuristic matching — Fire TV, Mac Mini, MacBook, iPhone, iPad, Windows PC, Android Device
- `resolveHostname(ip, executor)`: nslookup reverse DNS with injectable `ShellExecutor` for testability
- `scanLanDevices(executor, platform)`: Full pipeline — ARP scan → hostname enrichment (nslookup for Windows) → type inference
- 29 tests covering both OS formats, filtering edge cases, mock executor injection

### Task 2: Daemon Polling + CLI Command

**Daemon changes (packages/daemon/src/daemon.ts):**
- `LanScannerFn` type alias exported for injection
- `lanScanner` and `discoveryIntervalMs` constructor parameters (default: `scanLanDevices`, `30_000ms`)
- `startDeviceDiscovery()`: immediate scan + setInterval, emits `_deviceListeners` on JSON-diff change
- `stopDeviceDiscovery()`: clearInterval + resets `_lanDevices = []`
- `onDevicesUpdate(fn)`: listener pattern returning unsubscribe function
- `getLanDevices()`: now returns `this._lanDevices` (was stub returning `[]`)
- `getStatus()`: `lanDevices` field now uses `this._lanDevices`
- Auto-wired: `startDeviceDiscovery()` called after `connected` state, `stopDeviceDiscovery()` called in `disconnect()`
- 5 new tests: initial empty, scanner populates, stop clears, listener fires on change, listener deduplication

**CLI command (packages/cli/src/commands/devices.ts):**
- `homelan devices`: table output with padEnd column alignment (IP / Hostname / Type)
- `homelan devices --json`: JSON array output
- Daemon not running → exit 3 with "Error: homelan daemon is not running"
- Wired into `packages/cli/src/index.ts`

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical logic] Added multicast IP filtering**
- **Found during:** Task 1 test RED phase
- **Issue:** Test case included `224.0.0.22` (multicast address with MAC `01-00-5e-00-00-16`) which was passing through the filter since only `ff-ff-ff-ff-ff-ff` broadcast MAC was filtered
- **Fix:** Added `isFilteredIp()` helper that filters gateway (.1), broadcast (.255), AND multicast IP range (224-239.x.x.x first octet)
- **Files modified:** packages/daemon/src/platform/arp.ts
- **Commit:** e6f17cc

**2. [Pre-existing work detected] Plan 03-01 (switchMode) was implemented but never committed**
- **Found during:** Pre-task assessment — daemon.test.ts had 7 switchMode tests referencing `daemon.switchMode()`, `daemon.onModeChange()`, `_wgConfig` fields
- **Assessment:** daemon.ts, ipc/routes/switchMode.ts, and cli/commands/switchMode.ts all had the implementation already present from a previous agent run
- **Action:** No re-implementation needed — tests passed with existing code. These uncommitted 03-01 changes will be captured in the final metadata commit

---

## Test Results

| Package | Tests | Status |
|---------|-------|--------|
| shared | 6 | PASS |
| relay | 22 | PASS |
| daemon | 130 | PASS |
| cli | 4 | PASS |
| **Total** | **162** | **PASS** |

---

## Commits

| Hash | Description |
|------|-------------|
| e6f17cc | feat(03-02): ARP table parser module with LAN device discovery |
| daae37d | feat(03-02): daemon device discovery polling and homelan devices CLI command |

## Self-Check: PASSED

- FOUND: packages/daemon/src/platform/arp.ts
- FOUND: packages/daemon/src/platform/arp.test.ts
- FOUND: packages/cli/src/commands/devices.ts
- FOUND: .planning/phases/03-mode-switching-service-discovery/03-02-SUMMARY.md
- FOUND: e6f17cc commit
- FOUND: daae37d commit
- All 162 tests passing (130 daemon + 22 relay + 6 shared + 4 cli)
- Zero TypeScript build errors
