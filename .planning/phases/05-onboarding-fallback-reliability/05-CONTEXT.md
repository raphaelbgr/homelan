# Phase 5: Onboarding & Fallback Reliability - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Smooth first-user experience with secure key setup (QR/invite URL), production-ready fallback mechanisms (DDNS secondary discovery when relay is down), Claude Code skill integration for programmatic access, and local connection history logging. No new tunnel features or GUI redesigns — this is polish and reliability on top of Phases 1-4.

</domain>

<decisions>
## Implementation Decisions

### Key Onboarding Flow
- Relay generates a one-time invite token (cryptographically random, expires after single use or 15 minutes)
- Server exposes `POST /invite` → returns invite URL containing token + relay URL
- Invite URL format: `homelan://pair?token=<token>&relay=<relay-url>` (deep link for GUI, printable for CLI)
- QR code generated client-side from invite URL (no server-side QR generation needed)
- New device opens invite URL or scans QR → daemon extracts token → daemon POSTs to relay with token + its own public key → relay returns server's public key → key exchange complete
- User never sees or handles raw WireGuard keys
- GUI onboarding wizard: 2-step flow — (1) "Scan QR or paste invite link" (2) "Connected! Here's your home network" — minimal, not a multi-page setup
- CLI equivalent: `homelan pair <invite-url>` command for headless onboarding
- Invite tokens stored in relay's existing store (SQLite/memory) with TTL expiry

### DDNS Fallback Behavior
- Three-tier fallback already defined in NAT-04: relay → DDNS → hardcoded IP
- DDNS config stored in daemon config file (alongside RELAY_URL): `DDNS_HOSTNAME` env var (e.g., `myhome.duckdns.org`)
- Fallback is automatic — daemon tries relay first (5s timeout), then resolves DDNS hostname, then hardcoded IP
- User sees real-time progress in both GUI and CLI: "Relay unavailable, trying DDNS..." → "Using DDNS: myhome.duckdns.org" or "DDNS failed, trying direct IP..."
- Progress steps added to existing ConnectionProgress type: `trying_ddns` step between `trying_relay` and `connected`
- No DDNS update client in v1 — user configures DuckDNS/No-IP externally; HomeLAN only resolves the hostname
- If all three tiers fail, error message: "Could not reach home server. Check that your server is running and network is available."

### Claude Code Skill Design
- Skill definition file at `~/.claude/skills/homelan/SKILL.md` (standard Claude Code skill location)
- Skill wraps existing CLI commands — no new daemon API needed
- Exposed commands: `homelan connect`, `homelan disconnect`, `homelan switch-mode`, `homelan status`, `homelan devices`
- Status output is JSON by default (already decided Phase 2) — skill reads structured output directly
- Skill checks daemon availability first (`homelan status` exit code 3 = daemon not running)
- Error handling: skill surfaces CLI exit codes and error messages to Claude Code agent
- Skill does NOT manage daemon lifecycle (starting/stopping daemon is user responsibility)
- Skill metadata includes: description, available commands, expected output formats, error codes

### Connection History Logging
- Daemon logs connection sessions to a local JSON Lines file (`~/.homelan/history.jsonl`)
- Each entry: `{ timestamp, action, mode, duration_ms, peer_endpoint, fallback_method, error? }`
- Actions logged: connect, disconnect, mode_switch, error
- Duration calculated on disconnect (connected_at → disconnected_at)
- File rotation: keep last 1000 entries (simple truncation on write, not time-based)
- CLI command: `homelan history` — shows last 20 sessions in table format, `--json` for full dump, `--limit N` for custom count
- No GUI tab for history in v1 — CLI-only access is sufficient for debugging
- History file is append-only; daemon reads on startup only for `homelan history` queries

### Claude's Discretion
- QR code library choice (e.g., qrcode npm package)
- Exact invite token format and length
- DDNS resolution implementation details (dns.resolve vs fetch)
- History file location platform specifics (XDG on Linux, AppData on Windows, ~/Library on macOS)
- Skill file formatting and markdown structure
- Whether invite URL uses custom protocol scheme or HTTPS with redirect

</decisions>

<specifics>
## Specific Ideas

- Onboarding should feel like pairing AirPods — scan, done, connected
- The invite flow must work without the user understanding WireGuard keys at all
- DDNS is a safety net, not the primary path — relay-first is the design
- Claude Code skill is a first-class use case — Raphael's primary use case is AI agent accessing home LAN resources programmatically

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/relay/src/routes/register.ts`: Registration endpoint pattern — invite endpoint follows same Express route pattern
- `packages/relay/src/store/`: SQLite/Memory store abstraction — invite tokens can use same store with TTL
- `packages/daemon/src/nat/relayClient.ts`: RelayClient with register/lookup — extend with pair/invite methods
- `packages/shared/src/types/nat.ts`: ConnectionProgress type — add `trying_ddns` step
- `packages/cli/src/ipcClient.ts`: IpcClient HTTP wrapper — reuse for new CLI commands
- `packages/cli/src/commands/`: Existing command pattern (Commander.js) — add `pair` and `history` commands

### Established Patterns
- All CLI commands use Commander.js with `--json` flag option
- Daemon is single source of truth — history logging happens in daemon, not CLI
- IPC server exposes REST endpoints — new endpoints follow same Express route pattern
- Environment variables for config (RELAY_URL, RELAY_SECRET) — add DDNS_HOSTNAME
- Injectable dependencies in Daemon constructor for testability

### Integration Points
- Relay server: new `/invite` POST route + `/pair` POST route for token exchange
- Daemon: DDNS resolution added to connect() fallback chain
- Daemon: connection history append on state transitions
- CLI: new `homelan pair` and `homelan history` commands
- GUI: onboarding wizard as initial screen when no peer is configured
- Skill: file in `~/.claude/skills/homelan/` referencing CLI commands

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-onboarding-fallback-reliability*
*Context gathered: 2026-03-11*
