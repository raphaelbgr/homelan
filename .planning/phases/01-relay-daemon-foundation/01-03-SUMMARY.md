---
phase: 01-relay-daemon-foundation
plan: "03"
subsystem: infra
tags: [wireguard, keychain, crypto, state-machine, node-crypto, execfile, platform]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@homelan/shared types (ConnectionState, PeerInfo, WireguardKeypair)"
provides:
  - "execFileSafe shell executor using execFile (not exec) - prevents injection, args always array"
  - "KeychainStore interface with getKeychain() factory: WindowsKeychain, MacosKeychain, FileKeystore"
  - "FileKeystore: CI-safe ~/.homelan/keys.json backend used in all tests"
  - "generateKeypair(): Node.js built-in crypto (X25519/Curve25519), no wg binary required"
  - "WireGuardInterface lifecycle: configure/up/down/status with injected ShellExecutor"
  - "StateMachine with validated transitions and synchronous onTransition listeners"
affects:
  - 01-relay-daemon-foundation
  - 02-tunnel-nat-cli

# Tech tracking
tech-stack:
  added:
    - "node:crypto generateKeyPairSync (X25519/Curve25519 key generation)"
    - "node:child_process execFile+spawn (safe shell execution)"
    - "vitest 1.x (daemon test runner)"
    - "typescript 5.x (daemon tsconfig)"
  patterns:
    - "execFileSafe: all shell execution uses execFile with args array - never template string shell"
    - "Injected ShellExecutor: WireGuardInterface accepts executor in constructor for test isolation"
    - "FileKeystore as CI-safe test double: platform keychain tests use FileKeystore directly"
    - "Node.js built-in crypto for WireGuard keygen: no wg binary needed for key generation"
    - "StateTransitionError extends Error: typed error for invalid FSM transitions"

key-files:
  created:
    - packages/daemon/tsconfig.json
    - packages/daemon/src/utils/execFile.ts
    - packages/daemon/src/keychain/index.ts
    - packages/daemon/src/keychain/windows.ts
    - packages/daemon/src/keychain/macos.ts
    - packages/daemon/src/keychain/filestore.ts
    - packages/daemon/src/keychain/index.test.ts
    - packages/daemon/src/wireguard/keygen.ts
    - packages/daemon/src/wireguard/keygen.test.ts
    - packages/daemon/src/wireguard/interface.ts
    - packages/daemon/src/wireguard/interface.test.ts
    - packages/daemon/src/state/machine.ts
    - packages/daemon/src/state/machine.test.ts
  modified:
    - packages/daemon/package.json

key-decisions:
  - "generateKeypair() uses Node.js built-in crypto (X25519) instead of wireguard-tools npm package"
  - "wg pubkey derivation uses spawn with stdin - private key written to proc.stdin, never shell-interpolated"
  - "All tests use FileKeystore directly - platform keychain backends are integration-only, not unit-tested in CI"

patterns-established:
  - "All shell invocations use execFileSafe(cmd, argsArray) - enforced by code review and test coverage"
  - "WireGuardInterface constructor accepts ShellExecutor for test injection"
  - "StateMachine VALID_TRANSITIONS table is the single source of truth for allowed state changes"

requirements-completed:
  - DAEM-01
  - DAEM-02
  - AUTH-01

# Metrics
duration: 9min
completed: 2026-03-11
---

# Phase 1 Plan 03: WireGuard Key Management, OS Keychain, and State Machine Summary

**Platform-aware OS keychain (Windows/macOS/file fallback), WireGuard keygen via Node.js X25519 crypto, interface lifecycle with injected executor, and validated FSM with typed transition errors**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T19:17:22Z
- **Completed:** 2026-03-11T19:26:16Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- execFileSafe established as the sole shell execution primitive in the daemon - args always array, never interpolated into shell string
- KeychainStore abstraction with three backends: Windows Credential Manager (cmdkey/PowerShell P/Invoke), macOS security CLI, and FileKeystore (CI-safe, used in all tests)
- generateKeypair() uses Node.js built-in crypto (X25519/Curve25519) - produces WireGuard-compatible 44-char base64 keys without any external dependency or wg binary
- StateMachine validates all transitions against a VALID_TRANSITIONS table, throws StateTransitionError with descriptive message, supports synchronous onTransition listeners with unsubscribe
- WireGuardInterface writes wg .conf file to tmpdir and passes path as separate arg to wg-quick; ShellExecutor injection enables full test coverage without root access or wg binary
- 34 tests passing across 4 test files, TypeScript strict mode with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Safe shell executor, OS keychain abstraction, WireGuard keygen** - `d05be0c` (feat)
2. **Task 2: WireGuard interface lifecycle and state machine** - `e107ad1` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified
- `packages/daemon/tsconfig.json` - Daemon TypeScript config extending base (NodeNext, ES2022, strict)
- `packages/daemon/package.json` - Updated with express, zod, vitest, tsx dev deps
- `packages/daemon/src/utils/execFile.ts` - execFileSafe + ShellExecutor type, the only shell executor in daemon
- `packages/daemon/src/keychain/index.ts` - KeychainStore interface + getKeychain() platform factory
- `packages/daemon/src/keychain/windows.ts` - Windows Credential Manager via cmdkey + PowerShell P/Invoke
- `packages/daemon/src/keychain/macos.ts` - macOS Keychain via security CLI
- `packages/daemon/src/keychain/filestore.ts` - JSON file store in ~/.homelan/keys.json, CI-safe test backend
- `packages/daemon/src/keychain/index.test.ts` - 6 tests: store/retrieve/delete/overwrite/nonexistent/multi-key
- `packages/daemon/src/wireguard/keygen.ts` - generateKeypair() via Node.js crypto; CLI fallback also exported
- `packages/daemon/src/wireguard/keygen.test.ts` - 3 tests: 44-char base64, uniqueness, pub != priv
- `packages/daemon/src/wireguard/interface.ts` - WireGuardInterface class with configure/up/down/status
- `packages/daemon/src/wireguard/interface.test.ts` - 9 tests: lifecycle, arg array verification, config file content
- `packages/daemon/src/state/machine.ts` - StateMachine with VALID_TRANSITIONS + StateTransitionError
- `packages/daemon/src/state/machine.test.ts` - 16 tests: valid transitions, invalid transitions, listener lifecycle

## Decisions Made
- Node.js built-in crypto for WireGuard keygen: `wireguard-tools@0.3` does not exist (latest is 0.1.0), and its internals call shell commands with unsafe interpolation. Node.js `crypto.generateKeyPairSync('x25519')` produces identical Curve25519 keys with zero shell execution.
- wg pubkey still uses spawn-with-stdin for the CLI fallback path (private key via proc.stdin, never shell-interpolated)
- FileKeystore is the canonical test double - Windows/macOS backends are integration-tested only when those OS keychains are actually available

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced wireguard-tools npm dep with Node.js built-in crypto**
- **Found during:** Task 1 (WireGuard keygen)
- **Issue:** Plan specified `"wireguard-tools": "^0.3"` but the package's latest version is 0.1.0. The package also uses shell string interpolation internally - conflicting with the plan's security requirement to use execFile with args array.
- **Fix:** Implemented generateKeypair() using `node:crypto` `generateKeyPairSync('x25519')` - extracts raw 32-byte key material from DER encoding, produces identical 44-char base64 Curve25519 keys. CLI-based fallback `generateKeypairWithWgCli()` still exported for production use when wg binary is available.
- **Files modified:** packages/daemon/package.json (removed wireguard-tools), packages/daemon/src/wireguard/keygen.ts
- **Verification:** 3 keygen tests pass including regex validation of 44-char base64 format
- **Committed in:** d05be0c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for correctness - the specified package version did not exist and its internals violated the plan's security model. No scope creep, outcome identical.

## Issues Encountered
- `wg` binary not in PATH on Windows development machine - addressed by using Node.js built-in crypto as primary keygen path
- `wireguard-tools` npm package version mismatch (0.3 specified, 0.1.0 is latest) - resolved by replacing with Node.js crypto

## User Setup Required

None - no external service configuration required. WireGuard binary (`wg`, `wg-quick`) is only needed at daemon runtime, not during development or testing.

## Next Phase Readiness
- Plan 04 (IPC server) can build directly on top of: `KeychainStore` (for key retrieval), `StateMachine` (for connection state tracking), and `WireGuardInterface` (for tunnel lifecycle)
- All exports match the interfaces specified in the plan's `must_haves.artifacts` list
- No blocking issues - all runtime WireGuard operations (`wg-quick up/down`) are mocked in tests, real binary needed only at deploy time

---
*Phase: 01-relay-daemon-foundation*
*Completed: 2026-03-11*
