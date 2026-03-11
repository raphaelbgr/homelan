# Phase 2: Tunnel Connectivity & NAT Traversal - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver end-to-end encrypted P2P tunnel connectivity with automatic peer discovery via relay, UDP hole punching with relay fallback, and CLI commands (connect, disconnect, status). User can connect from anywhere and stay connected even behind NAT. Mode switching UI is Phase 3; GUI is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### NAT Traversal Strategy
- STUN via public STUN servers (Google's stun.l.google.com:19302 as primary, stun.cloudflare.com:3478 as backup) for external IP/port discovery
- UDP hole punching: both peers send probes to each other's STUN-discovered endpoints for 3-5 seconds
- If hole punching fails, fall back to relaying WireGuard UDP through the relay server (relay gets a `/relay` WebSocket endpoint for UDP proxying)
- Three-tier fallback order: relay lookup → DDNS lookup → hardcoded IP (configurable in daemon config)
- Connection progress reported via SSE events: "discovering_peer" → "trying_direct" → "trying_relay" → "connected" or "error"

### WireGuard Tunnel Configuration
- Use `wg` CLI tool for interface configuration (available on both Windows and macOS when WireGuard is installed)
- Windows: use `wireguard.exe /installtunnelservice` for persistent tunnel, or `wg-quick` equivalent
- macOS: use `wg-quick` via `brew install wireguard-tools`
- Tunnel IP assignment: daemon claims 10.0.0.2/24 (client), server is 10.0.0.1/24 — simple static allocation for v1 single-peer
- MTU: 1420 (standard WireGuard MTU accounting for overhead)
- PersistentKeepalive: 25 seconds (maintains NAT mappings)

### DNS Handling Per Mode
- Full Gateway mode: push home network DNS server (router IP, e.g., 192.168.7.1) as the sole DNS resolver; all DNS goes through tunnel
- LAN-Only mode: keep client's existing DNS resolver; only route home subnet (192.168.7.0/24) through tunnel
- DNS configuration via platform APIs: Windows uses `netsh interface ip set dns`, macOS uses `scutil --dns` / `networksetup`
- DNS leak prevention in Full Gateway: explicitly set DNS on the tunnel interface AND block non-tunnel DNS (firewall rule on Windows, pf on macOS)

### IPv6 Handling
- Disable IPv6 on the WireGuard interface entirely in v1
- Add firewall rules to block IPv6 traffic while tunnel is active (prevents IPv6 leak bypass)
- Log a warning if IPv6 is detected as active on any interface during connection

### CLI Design
- Command: `homelan` (installed via `npm install -g @homelan/cli` or linked from monorepo)
- `homelan connect [--mode full-gateway|lan-only]` — defaults to `lan-only` (safer default, user's internet stays on their own connection)
- `homelan disconnect` — tears down tunnel, reverts DNS and routing
- `homelan status` — JSON output by default (machine-readable for Claude Code), `--human` flag for table format
- Progress: CLI shows real-time spinner/status during connect (discovering... → trying direct... → connected), never hangs silently
- `--timeout <seconds>` flag on connect (default 30s)
- Exit codes: 0 = success, 1 = general error, 2 = timeout, 3 = daemon not running
- `--json` flag on all commands for uniform machine output
- Retry: `--retry <count>` on connect (default 0 — fail fast for CLI, retry is better handled by callers)

### Relay Client Integration
- Daemon registers with relay on startup (POST /register with public key + STUN-discovered endpoint)
- Re-registers on a TTL/2 interval to stay fresh
- Lookup peer's endpoint via GET /lookup/:publicKey before each connection attempt
- Relay secret shared between daemon and relay via config (RELAY_SECRET env var)

### Claude's Discretion
- Exact STUN implementation (raw UDP or use a lightweight STUN library)
- WebSocket relay protocol details (framing, keepalive intervals)
- Specific firewall rule syntax per platform
- CLI spinner/progress library choice
- Config file format and location (~/.homelan/config.json or similar)

</decisions>

<specifics>
## Specific Ideas

- Default to `lan-only` mode on connect — Full Gateway should be an explicit choice since it routes all internet through home
- Status output must be machine-readable JSON by default (Claude Code primary consumer)
- Connection progress should be visible in both CLI output AND SSE events (so GUI in Phase 4 can show the same states)
- The daemon should handle all WireGuard/routing/DNS complexity — CLI is a thin IPC client

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/types/daemon.ts`: ConnectionState, TunnelMode, PeerInfo, DaemonStatus — tunnel state types ready
- `packages/shared/src/types/ipc.ts`: IpcConnectRequest/Response, SseEventType — IPC contracts for connect/disconnect
- `packages/daemon/src/state/machine.ts`: StateMachine with transition listeners — wire tunnel state changes here
- `packages/daemon/src/wireguard/keygen.ts`: X25519 keypair generation — keys ready for tunnel setup
- `packages/daemon/src/wireguard/interface.ts`: WireGuardInterface with configure/up/down — needs real implementation behind stubs
- `packages/daemon/src/keychain/`: KeychainStore — retrieve private key for WireGuard config
- `packages/daemon/src/ipc/routes/connect.ts`: Currently returns 501 — needs real implementation
- `packages/relay/src/routes/register.ts` + `lookup.ts`: Registration and lookup endpoints ready

### Established Patterns
- execFileSafe(cmd, argsArray) for all shell commands — prevents injection
- Express route factories returning Router — same pattern for new relay endpoints
- Vitest for all tests, TDD approach (RED → GREEN)
- StateMachine listeners for event propagation to SSE

### Integration Points
- Daemon.connect() method needs to: lookup peer via relay → STUN → hole punch → configure WireGuard → transition state
- IPC /connect route delegates to Daemon.connect()
- IPC /disconnect route delegates to Daemon.disconnect()
- New SSE event types needed: connection_progress (for step-by-step feedback)
- CLI package (`packages/cli/`) exists but is empty — Commander.js for arg parsing
- Relay may need new `/relay` WebSocket endpoint for UDP relay fallback

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-tunnel-connectivity-nat-traversal*
*Context gathered: 2026-03-11*
