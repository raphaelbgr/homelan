# HomeLAN

A personal VPN tool built on WireGuard that connects you to your home network from anywhere as if you're on its LAN. One click or one CLI command.

```
$ homelan connect
Connected to home network (lan-only mode)
Tunnel: 10.0.0.2/24 via relay.example.com
```

## What It Does

- **Full Gateway mode** — routes all internet traffic through your home network
- **LAN-Only mode** — routes only home subnet traffic (safer default, your internet stays direct)
- **One-click connect** via desktop GUI or `homelan connect` CLI
- **AI-agent friendly** — Claude Code can connect to your home network programmatically via the built-in skill
- **Zero port forwarding** — relay server handles NAT traversal, DDNS as fallback
- **WireGuard** — fast, modern, kernel-level encryption (ChaCha20-Poly1305)

## Architecture

```
                        Internet
                           |
                    ┌──────┴──────┐
                    │ Relay Server │  (Vercel / VPS / free tier)
                    │  Express.js  │  peer discovery + NAT traversal
                    └──────┬──────┘
                           |
              ┌────────────┴────────────┐
              |                         |
        ┌─────┴─────┐           ┌──────┴──────┐
        │  Client    │◄─────────►│ Home Server  │
        │  (you)     │ WireGuard │  (any home   │
        │            │  tunnel   │   machine)   │
        └─────┬─────┘           └──────┬──────┘
              |                         |
         ┌────┴────┐              ┌────┴────┐
         │ GUI/CLI │              │ Home LAN │
         └─────────┘              └─────────┘
                                  SMB shares, SSH,
                                  local services...
```

**How it works:**
1. Client registers with relay server (announces public key + endpoint)
2. Relay coordinates NAT hole-punching between client and home server
3. WireGuard tunnel established — all traffic is peer-to-peer (relay is not in the data path)
4. If hole-punching fails: DDNS fallback, then relay-assisted UDP forwarding

## Quick Start

### Prerequisites

- **Node.js 22+** and **pnpm 9+**
- **WireGuard** installed on both client and server machines
- A relay server (self-hosted or cloud-deployed)

### Install

```bash
git clone https://github.com/raphaelbgr/homelan.git
cd homelan
pnpm install
pnpm build
```

### Set Up the Relay Server

```bash
# Set required environment variables
export RELAY_SECRET="your-secret-here"
export RELAY_SERVER_PUBLIC_KEY="<home-server-wireguard-public-key>"
export RELAY_URL="https://your-relay.example.com"

# Start the relay
cd packages/relay
node dist/index.js
```

Deploy to Vercel, AWS Lambda, or any VPS. The relay is stateless and lightweight.

### Set Up the Daemon (Client Machine)

The daemon runs as a background service and manages the WireGuard tunnel.

```bash
# Start the daemon (requires root/admin for WireGuard)
sudo node packages/daemon/dist/index.js
```

The daemon:
- Listens on `localhost:30001` for IPC from GUI/CLI
- Manages WireGuard interface lifecycle
- Stores keys in OS keychain (Windows Credential Manager / macOS Keychain)
- Logs connection history to `~/.homelan/history.jsonl`

### Connect via CLI

```bash
# Connect in LAN-only mode (default, safer)
homelan connect

# Connect in full-gateway mode (all traffic through home)
homelan connect --mode full-gateway

# Check status
homelan status

# List discovered LAN devices
homelan devices

# Switch mode without reconnecting
homelan switch-mode full-gateway

# Disconnect
homelan disconnect
```

### Connect via Desktop GUI

```bash
# Build and run the Tauri desktop app
cd packages/gui
pnpm tauri dev
```

The GUI provides:
- One-click connect/disconnect
- Mode toggle (Full Gateway / LAN-Only)
- Real-time status with SSE events
- Device discovery list
- System tray with quick actions
- Onboarding wizard for new devices

### Pair a New Device

```bash
# On the home server: generate an invite
curl -X POST https://your-relay/invite \
  -H "Authorization: Bearer $RELAY_SECRET"

# On the new client: pair using the invite URL
homelan pair "homelan://pair?token=abc123&relay=https://your-relay"
```

## CLI Reference

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `homelan connect [--mode]` | Connect to home network | 0=ok, 1=fail, 3=no daemon |
| `homelan disconnect` | Disconnect tunnel | 0=ok, 1=fail, 3=no daemon |
| `homelan status [--human]` | Show status (JSON default) | 0=ok, 3=no daemon |
| `homelan switch-mode <mode>` | Change routing mode | 0=ok, 1=fail, 3=no daemon |
| `homelan devices [--json]` | List LAN devices | 0=ok, 3=no daemon |
| `homelan pair <url>` | Onboard new device | 0=ok, 1=fail, 3=no daemon |
| `homelan history [--limit N]` | Connection history | 0=ok, 3=no daemon |

All commands output JSON by default (machine-readable). Use `--human` or `--json` flags to control format.

**Exit code 3** means the daemon is not running — start it first.

## Claude Code Integration

HomeLAN ships with a Claude Code skill at `.claude/skills/homelan/`. When installed, Claude Code can:

```bash
# Check if connected to home network
homelan status --json

# Connect before accessing home resources
homelan connect --mode lan-only

# Access home LAN resources (SMB shares, SSH, APIs)
# ... your agent workflow here ...

# Disconnect when done
homelan disconnect
```

See [`.claude/skills/homelan/SKILL.md`](.claude/skills/homelan/SKILL.md) for the full skill definition and [`.claude/skills/homelan/rules/commands.md`](.claude/skills/homelan/rules/commands.md) for detailed command reference with JSON schemas.

## Project Structure

```
homelan/
├── packages/
│   ├── shared/          # TypeScript type contracts (DaemonStatus, TunnelMode, etc.)
│   ├── relay/           # Express.js relay server (peer discovery, onboarding)
│   ├── daemon/          # Client daemon (WireGuard, NAT, IPC server, history)
│   ├── cli/             # Commander.js CLI tool (7 commands)
│   └── gui/             # Tauri + React desktop app
├── .claude/
│   └── skills/homelan/  # Claude Code skill definition
├── .planning/           # Development process (roadmap, research, phase plans)
│   ├── PROJECT.md       # Requirements and key decisions
│   ├── ROADMAP.md       # 5-phase development roadmap
│   ├── STATE.md         # Current progress tracker
│   ├── research/        # Architecture research and stack analysis
│   └── phases/          # Detailed phase plans, summaries, and UAT results
└── CLAUDE.md            # AI instructions for working with this codebase
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests (301 tests across 5 packages)
pnpm test

# Run tests for a specific package
pnpm --filter @homelan/daemon test
pnpm --filter @homelan/relay test
pnpm --filter @homelan/cli test
pnpm --filter @homelan/gui test

# Type-check everything
pnpm typecheck
```

### Test Coverage

| Package | Tests | Coverage |
|---------|-------|----------|
| @homelan/shared | 12 | Type contracts, IPC schemas |
| @homelan/relay | 46 | Routes, auth, token lifecycle, edge cases |
| @homelan/daemon | 193 | State machine, WireGuard, NAT, IPC, history, DDNS |
| @homelan/cli | 30 | All 7 commands, error handling, output formats |
| @homelan/gui | 20 | React hooks, OnboardingWizard, state transitions |
| **Total** | **301** | |

### Tech Stack

| Component | Technologies |
|-----------|-------------|
| Relay Server | Node.js 22, Express 5, WebSocket (ws), SQLite, Zod |
| Daemon | Node.js 22, Express 5, node:crypto (X25519), node:dgram (STUN) |
| CLI | Node.js 22, Commander.js, ora |
| Desktop GUI | Tauri 2, React 19, Vite, Tailwind CSS, shadcn/ui |
| VPN | WireGuard (ChaCha20-Poly1305, Curve25519) |
| Testing | Vitest, Supertest, Testing Library |

## How It Was Built

The `.planning/` directory contains the complete development process:

- **[PROJECT.md](.planning/PROJECT.md)** — Requirements, constraints, and key decisions
- **[ROADMAP.md](.planning/ROADMAP.md)** — 5-phase development plan with success criteria
- **[STATE.md](.planning/STATE.md)** — Progress tracking (v1.0 complete: 54/54 requirements)
- **[research/](.planning/research/)** — Architecture analysis, stack selection, pitfall assessment
- **[phases/](.planning/phases/)** — Detailed plans, execution summaries, and UAT results for each phase

Built entirely with Claude Code (Opus) using the [GSD workflow](https://github.com/coleam00/get-shit-done-claude).

## License

MIT
