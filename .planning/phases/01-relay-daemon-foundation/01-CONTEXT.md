# Phase 1: Relay & Daemon Foundation - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish foundational infrastructure: a lightweight relay server for peer registration/lookup (HTTPS), and a client daemon that manages WireGuard key lifecycle, interface creation, and exposes an IPC API for GUI/CLI consumers. This phase does NOT establish tunnels or NAT traversal — it builds the pieces that Phase 2 connects.

</domain>

<decisions>
## Implementation Decisions

### Relay Deployment Model
- Relay must work as both serverless (Vercel Functions / AWS Lambda) and long-running process (Docker, VPS, any machine)
- Design as stateless HTTP handlers — no WebSocket, no long-lived connections
- Peer state stored in lightweight persistent store (SQLite file for self-hosted, Vercel KV or similar for serverless)
- Relay should be a standalone npm package/directory, independently deployable
- Single `relay/` directory in monorepo with its own package.json

### Relay API Design
- REST endpoints: `POST /register` (peer registers its public key + endpoint), `GET /lookup/:publicKey` (find peer by key)
- HTTPS-only enforced (reject HTTP, redirect or error)
- Config validation on startup: required fields (TLS cert path for self-hosted, allowed origins), fail fast with clear error messages to stdout
- No authentication on relay itself for v1 — WireGuard keys authenticate at tunnel level
- Response format: JSON with consistent error schema `{ error: string, code: string }`
- Rate limiting: basic IP-based rate limiting to prevent abuse (configurable)

### Daemon Architecture
- Node.js long-running process with elevated privileges (needs root/admin for WireGuard interface)
- Exposes HTTP REST API on `localhost:30001` (IPC for GUI/CLI)
- Daemon is single source of truth for all state — GUI and CLI are stateless consumers
- Event-based state updates via Server-Sent Events (SSE) on `GET /events` — GUI/CLI subscribe for real-time updates
- Daemon manages: WireGuard interface lifecycle, key generation/storage, relay client communication, connection state machine

### Daemon IPC API (v1 endpoints)
- `GET /status` — connection state, current mode, latency, throughput, host info
- `GET /devices` — LAN device list (populated in Phase 3)
- `GET /events` — SSE stream of state changes
- `POST /connect` — initiate tunnel (Phase 2 implements handler)
- `POST /disconnect` — tear down tunnel (Phase 2 implements handler)
- `POST /switch-mode` — change routing mode (Phase 3 implements handler)
- Phase 1 stubs these endpoints with proper schemas; Phase 2+ fills in implementations

### Key Management
- WireGuard key pairs generated using wireguard-tools npm package
- Keys stored in OS keychain: Windows Credential Manager, macOS Keychain
- Fallback to encrypted config file (`~/.homelan/keys.enc`) if keychain unavailable
- Key generation happens on first daemon start — automatic, no user interaction
- Private key never exposed via IPC API — only public key retrievable

### Project Structure (Monorepo)
- `packages/relay/` — Relay server (Express, independently deployable)
- `packages/daemon/` — Client daemon (WireGuard management, IPC server)
- `packages/shared/` — Shared types, schemas, constants (TypeScript)
- `packages/cli/` — CLI tool (Phase 2, but directory created now)
- `packages/gui/` — Tauri app (Phase 4, but directory created now)
- Root: pnpm workspaces, shared TypeScript config, shared ESLint config

### Claude's Discretion
- Exact Express middleware stack for relay
- Daemon process management details (PID file location, graceful shutdown)
- Internal state machine implementation for daemon
- SSE keepalive interval and reconnection strategy
- Monorepo tooling choices (turborepo vs nx vs plain pnpm workspaces)

</decisions>

<specifics>
## Specific Ideas

- Relay should be trivially deployable — `vercel deploy` or `docker run` or `node relay/index.js` should all work
- Daemon should never hang silently — all operations must have timeouts and status reporting
- User's home network: 192.168.7.0/24 subnet with devices at .101 (Windows), .102 (Mac Mini), .152 (Fire TV)
- Daemon IPC should be rich enough for Claude Code to query full network state without the CLI as intermediary
- User explicitly wants "never keep the user in the dark" — daemon must emit state transitions via SSE

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns all other phases follow
- Monorepo with shared TypeScript types will be the foundation

### Integration Points
- Relay ↔ Daemon: Daemon acts as relay client (registers on startup, looks up peers before connecting)
- Daemon ↔ CLI/GUI: HTTP IPC on localhost:30001 + SSE for events
- User mentioned existing network discovery tools in their GitHub repos — potentially reusable in Phase 3 (service discovery)

</code_context>

<deferred>
## Deferred Ideas

- Multi-host support (connecting to multiple home networks) — noted for v2
- User's GitHub network discovery tools — evaluate for Phase 3 (service discovery)

</deferred>

---

*Phase: 01-relay-daemon-foundation*
*Context gathered: 2026-03-11*
