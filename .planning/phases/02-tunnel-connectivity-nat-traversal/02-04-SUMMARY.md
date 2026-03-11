---
phase: 02-tunnel-connectivity-nat-traversal
plan: 04
subsystem: platform
tags: [dns, ipv6, platform, wireguard, leak-prevention, dependency-injection]

# Dependency graph
requires:
  - phase: 01-03
    provides: execFileSafe, ShellExecutor type — sole shell executor pattern
  - phase: 02-03
    provides: Daemon class with injectable constructor pattern; connect/disconnect methods

provides:
  - "dns.ts: DnsConfigurator — setDns(iface, server) and restoreDns(iface) via netsh (win32) or networksetup (darwin)"
  - "ipv6.ts: IPv6Blocker — blockIPv6(iface) and restoreIPv6(iface) via netsh (win32) or networksetup (darwin)"
  - "Daemon.connect(): blockIPv6 always; setDns only for full-gateway mode; lan-only keeps existing DNS"
  - "Daemon.disconnect(): restoreIPv6 + restoreDns (safe no-op if not previously applied)"

affects:
  - 02-05 (CLI commands exercise connect/disconnect path which now applies DNS/IPv6 rules)
  - 03-01 (mode switching relies on correct per-mode DNS behavior)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Platform detection injectable via opts.platform — enables cross-platform tests without mocking process.platform"
    - "Policy failures in connect/disconnect are warned but non-fatal — WireGuard tunnel up is more important than DNS enforcement"

key-files:
  created:
    - packages/daemon/src/platform/dns.ts
    - packages/daemon/src/platform/dns.test.ts
    - packages/daemon/src/platform/ipv6.ts
    - packages/daemon/src/platform/ipv6.test.ts
  modified:
    - packages/daemon/src/daemon.ts
    - packages/daemon/src/daemon-connect.test.ts

key-decisions:
  - "Platform detection injectable via opts.platform — tests pass win32/darwin without being on that OS; no process.platform mocking needed"
  - "DNS/IPv6 policy failures are warnings, not errors — WireGuard tunnel is more valuable than enforced DNS in a failure scenario"
  - "restoreDns called in both modes on disconnect — safe no-op on lan-only where setDns was never called"

requirements-completed: [TUNL-05, TUNL-06, TUNL-08, TUNL-09]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 2 Plan 4: DNS Configuration and IPv6 Leak Prevention Summary

**Platform DNS configurator and IPv6 blocker injected into Daemon connect/disconnect — Full Gateway sets home DNS (192.168.7.1), LAN-Only keeps existing resolver, both modes disable IPv6 on tunnel interface via netsh (Windows) or networksetup (macOS)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T20:22:15Z
- **Completed:** 2026-03-11T20:25:11Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `packages/daemon/src/platform/dns.ts` — DnsConfigurator with setDns/restoreDns, platform-branched on win32 vs darwin, injectable executor and platform for testability
- Created `packages/daemon/src/platform/ipv6.ts` — IPv6Blocker with blockIPv6/restoreIPv6, same platform-injectable pattern
- 5 new platform tests (3 DNS + 2 IPv6), all using vi.fn() mock executor with no real OS calls
- Injected dnsConfigurator and ipv6Blocker into Daemon constructor with real implementations as defaults
- connect(): blockIPv6 always; setDns("homelan", "192.168.7.1") only in full-gateway; lan-only skips DNS change
- disconnect(): restoreIPv6 + restoreDns (safe regardless of mode)
- 4 new daemon-connect tests (Tests 6-9) verifying DNS/IPv6 wiring
- 86 tests passing (78 prior + 5 platform + 3 daemon wiring), TypeScript strict zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: DnsConfigurator + IPv6Blocker platform modules** - `d814fc5` (feat, TDD)
2. **Task 2: Wire DNS + IPv6 into Daemon connect/disconnect** - `a4b9469` (feat)

_Note: Task 1 used TDD (RED then GREEN)_

## Files Created/Modified

- `packages/daemon/src/platform/dns.ts` — DnsConfigurator: setDns/restoreDns per platform (win32/darwin)
- `packages/daemon/src/platform/dns.test.ts` — 3 tests: win32 setDns, win32 restoreDns, darwin setDns
- `packages/daemon/src/platform/ipv6.ts` — IPv6Blocker: blockIPv6/restoreIPv6 per platform
- `packages/daemon/src/platform/ipv6.test.ts` — 2 tests: win32 blockIPv6, darwin restoreIPv6
- `packages/daemon/src/daemon.ts` — Added dnsConfigurator/ipv6Blocker to constructor; wired into connect/disconnect
- `packages/daemon/src/daemon-connect.test.ts` — Added mockDnsConfigurator + mockIPv6Blocker injection; 4 new tests

## Decisions Made

- Platform detection injectable via `opts.platform` — enables cross-platform tests without mocking `process.platform`; tests explicitly pass `"win32"` or `"darwin"` to exercise each OS branch
- DNS/IPv6 policy failures are caught and warned but non-fatal — WireGuard tunnel staying up is more important than enforced DNS/IPv6 policy in edge cases
- `restoreDns` called unconditionally on disconnect in both modes — safe no-op when setDns was never called (macOS "empty" and Windows dhcp restore are idempotent)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- DNS and IPv6 enforcement complete for Phase 2
- Plan 02-05 (CLI connect/disconnect commands) can now wire IPC routes
- All 5 Phase 2 platform requirements satisfied: TUNL-05, TUNL-06, TUNL-08, TUNL-09

---
*Phase: 02-tunnel-connectivity-nat-traversal*
*Completed: 2026-03-11*
