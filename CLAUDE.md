# HomeLAN — Claude Code Instructions

Personal VPN tool built on WireGuard. Connects to a home LAN from anywhere via CLI or desktop GUI.

## Quick Reference

```bash
# Build & test
pnpm install && pnpm build && pnpm test

# Run a single package's tests
pnpm --filter @homelan/daemon test
pnpm --filter @homelan/relay test
```

## Using HomeLAN from Claude Code

If your goal is to **use** HomeLAN (connect to a home network), see the skill at `.claude/skills/homelan/SKILL.md`.

```bash
# Check if daemon is running (exit code 3 = not running)
homelan status --json

# Connect (lan-only is the safe default)
homelan connect --mode lan-only

# Access LAN resources (SMB shares, SSH, local APIs, etc.)
# ...

# Disconnect when done
homelan disconnect
```

All CLI commands output JSON by default. Exit codes: 0=success, 1=failure, 3=daemon not running.

## Monorepo Layout

```
packages/
  shared/    # TypeScript types shared across all packages (zero deps)
  relay/     # Express.js relay server — peer discovery + onboarding
  daemon/    # Background service — WireGuard lifecycle, IPC on localhost:30001
  cli/       # Commander.js CLI — 7 commands: connect, disconnect, status, switch-mode, devices, pair, history
  gui/       # Tauri + React desktop app — one-click connect, system tray
```

**Dependency flow:** `shared` <- `relay`, `daemon` <- `cli`, `gui`

## Architecture

- **Daemon** is the single source of truth. GUI and CLI are thin IPC clients.
- **IPC** is HTTP on `localhost:30001` with SSE for real-time events.
- **Relay** handles peer discovery and NAT traversal only — never touches tunnel traffic.
- **WireGuard** keys stored in OS keychain (Windows Credential Manager / macOS Keychain).

## Code Conventions

- **TypeScript strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- **ESM only** — `"type": "module"` in all packages, NodeNext module resolution
- **Vitest** for all tests — run with `pnpm test` or `pnpm --filter <pkg> test`
- **No mocking modules** — injectable dependencies passed via constructor/factory params
- **Express route factories** — `createRouter(store, config)` pattern, not singletons
- **Exit codes** — CLI uses 0 (success), 1 (failure), 3 (daemon not running)

## Key Files

| What | Where |
|------|-------|
| Daemon main class | `packages/daemon/src/daemon.ts` |
| State machine | `packages/daemon/src/state/machine.ts` |
| WireGuard interface | `packages/daemon/src/wireguard/interface.ts` |
| NAT traversal | `packages/daemon/src/nat/` (stun, holePunch, relayClient) |
| IPC server | `packages/daemon/src/ipc/server.ts` |
| Relay app | `packages/relay/src/app.ts` |
| CLI entry | `packages/cli/src/index.ts` |
| GUI app | `packages/gui/src/App.tsx` |
| Shared types | `packages/shared/src/types/` |
| Claude Code skill | `.claude/skills/homelan/SKILL.md` |

## Testing

301 tests across 5 packages. Run all with `pnpm test`.

| Package | Tests | Focus |
|---------|-------|-------|
| shared | 12 | Type contracts |
| relay | 46 | HTTP routes, auth, tokens |
| daemon | 193 | State, WireGuard, NAT, IPC, history, DDNS |
| cli | 30 | Commands, output formats, error handling |
| gui | 20 | React hooks, OnboardingWizard |

## Development Process

The `.planning/` directory documents the full build process:
- `PROJECT.md` — requirements and decisions
- `ROADMAP.md` — 5-phase plan
- `STATE.md` — progress tracker
- `phases/` — detailed plans, summaries, UAT results per phase
