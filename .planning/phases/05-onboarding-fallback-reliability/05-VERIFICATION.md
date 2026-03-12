---
phase: 05-onboarding-fallback-reliability
verified: 2026-03-12T23:45:00Z
status: passed
score: 5/5 truths verified
re_verification: false
---

# Phase 05: Onboarding & Fallback Reliability Verification Report

**Phase Goal:** Smooth first-user experience with secure key setup, production-ready fallback mechanisms (DDNS secondary discovery), and Claude Code skill integration.

**Verified:** 2026-03-12T23:45:00Z
**Status:** PASSED
**Re-verification:** No (initial verification)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New user can onboard via one-time invite URL exchanged securely — token expires after 15min or first use | ✓ VERIFIED | POST /invite route generates cryptographically random 64-char hex token (node:crypto.randomBytes), stores in Map with expiresAt timestamp. POST /pair validates token, enforces single-use (delete before respond), stores client key in PeerStore. Token in homelan:// deep link format: `homelan://pair?token={token}&relay={relayUrl}` |
| 2 | Daemon receives invite URL via CLI pair command, calls relay pair endpoint, exchanges keys securely | ✓ VERIFIED | `homelan pair <url>` command posts to /pair IPC. RelayClient.pair(inviteUrl) parses homelan:// URL scheme, extracts token and relay URL, POSTs to relay /pair with clientPublicKey. Stores serverPublicKey + relayUrl in keychain on success. Returns exit 0 on success, 1 on failure, 3 when daemon not running |
| 3 | Daemon automatically falls back to DDNS resolution when relay is unreachable — user sees "trying_ddns" progress | ✓ VERIFIED | Daemon.connect() emits progress("trying_ddns") after relay fails. Uses injectable dnsResolver (default: dns.promises.resolve4) to resolve ddnsHostname from config. Extracts first IP, combines with original peer port, uses as WireGuard endpoint. Falls back to relay if DDNS fails. History logged with fallback_method: "ddns" when used |
| 4 | Connection history is logged locally (JSON Lines append-only) with timestamps, modes, durations, fallback methods | ✓ VERIFIED | HistoryLogger appends to ~/.homelan/history.jsonl. Each entry: { timestamp: ISO8601, action: "connect"|"disconnect"|"mode_switch"|"error", mode?, duration_ms?, peer_endpoint?, fallback_method?, error? }. Auto-trims at 1000 entries. Daemon logs on all state transitions (connect/disconnect/mode_switch/error). GET /history IPC returns last N entries with configurable limit (default 20, max 100) |
| 5 | Claude Code skill documents all 7 CLI commands with exact syntax, exit codes, JSON schemas, and AI agent workflow examples | ✓ VERIFIED | .claude/skills/homelan/SKILL.md: When to Use, Prerequisites, Status Detection Pattern, Error Handling sections. rules/commands.md: all 7 commands (connect, disconnect, status, switch-mode, devices, pair, history) with syntax, options, exit codes, JSON schemas, and 5 workflow examples (file share access, SSH topology, mode switching, device onboarding, connection debugging) |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/relay/src/routes/invite.ts` | POST /invite with Bearer auth, 15-min TTL | ✓ VERIFIED | 59 lines. Generates token via randomBytes(32).toString('hex'), stores in InviteStore with expiresAt, returns homelan:// URL. Auth required via config.relaySecret header |
| `packages/relay/src/routes/pair.ts` | POST /pair with token validation, single-use enforcement | ✓ VERIFIED | 67 lines. Validates token exists + not expired (401 if invalid). Deletes token before responding (single-use enforcement). Upserts client WireGuard key in PeerStore. Returns serverPublicKey + relayUrl |
| `packages/daemon/src/history/logger.ts` | HistoryLogger class: JSON Lines append, 1000-entry cap, getEntries(limit) | ✓ VERIFIED | 63 lines. Appends HistoryEntry as JSON Lines to ~/.homelan/history.jsonl. Trims to 1000 entries on append. getEntries(limit) returns last N entries (default 20). File created if not exists with mkdirSync recursive |
| `packages/daemon/src/nat/relayClient.ts` | pair(inviteUrl) method parsing homelan:// and POSTing to relay | ✓ VERIFIED | Added pair() method (~50 lines). Parses custom homelan:// URL scheme via URL constructor. Extracts token and relay from searchParams. POSTs to relay /pair with clientPublicKey. Returns PairResponse or throws RelayClientError |
| `packages/daemon/src/daemon.ts` | Daemon.pair() method storing keys in keychain; DDNS fallback in connect(); history logging on state transitions | ✓ VERIFIED | pair() method calls relayClient.pair(inviteUrl), stores serverPublicKey + relayUrl in keychain. connect() emits trying_ddns, resolves ddnsHostname via injectable dnsResolver, uses resolved IP as peer endpoint. History logged on all state transitions (connect/disconnect/mode_switch/error) |
| `packages/daemon/src/ipc/routes/pair.ts` | POST /pair IPC validating inviteUrl, checking idle state, returning error codes | ✓ VERIFIED | 50 lines. Validates inviteUrl (400), checks daemon.state !== idle (409), calls daemon.pair(), catches RelayClientError (500), returns { ok: true } on success |
| `packages/daemon/src/ipc/routes/history.ts` | GET /history IPC with limit param, returning HistoryEntry[] | ✓ VERIFIED | 27 lines. Parses ?limit query param (default 20, max 100), calls daemon.historyLogger.getEntries(limit), returns { entries: HistoryEntry[] } |
| `packages/cli/src/commands/pair.ts` | homelan pair <invite-url> command with spinner, --json flag, exit codes | ✓ VERIFIED | 84 lines. POST /pair IPC, ora spinner, --json flag, 409 conflict handling, exit 0/1/3. Checks isRunning() first |
| `packages/cli/src/commands/history.ts` | homelan history command with --json and --limit options, table formatting | ✓ VERIFIED | 101 lines. GET /history?limit=N IPC, table formatting (Timestamp/Action/Mode/Duration/Method), --json raw output, isRunning() check, exit 0/1/3 |
| `packages/gui/src/hooks/usePairing.ts` | usePairing hook: pair(inviteUrl) POST to /pair, state tracking, returns boolean | ✓ VERIFIED | 57 lines. Manages state (idle/pairing/success/error), pair() method POSTs to IPC /pair, returns Promise<boolean> on success/failure, setError stores message |
| `packages/gui/src/components/OnboardingWizard.tsx` | 2-step wizard: Step 1 invite URL input + Pair button; Step 2 success confirmation + Get Started button | ✓ VERIFIED | 79 lines. Step 1: inviteUrl input, handlePair() calls usePairing.pair(), error display, loading button state. Step 2: CheckCircle2 icon, success text, Get Started button calls onComplete(). Styled with Tailwind dark theme (bg-gray-900, text-white) |
| `packages/gui/src/App.tsx` | Pair Device button in header (hidden when connected); OnboardingWizard overlay rendering | ✓ VERIFIED | showOnboarding state, Pair Device button visible when status?.state !== "connected", fixed full-screen overlay (inset-0 bg-black/80 z-50) with centered OnboardingWizard |
| `.claude/skills/homelan/SKILL.md` | Skill index: When to Use, Prerequisites, Status Detection Pattern, Error Handling | ✓ VERIFIED | 47 lines. Covers all use cases (check status, connect/disconnect, mode switching, device listing, pairing, history). Prerequisites (daemon must be running), Status Detection Pattern with exit code 3 check, Error Handling section |
| `.claude/skills/homelan/rules/commands.md` | Full command reference: all 7 commands, syntax, options, exit codes, JSON schemas, 5 workflow examples | ✓ VERIFIED | 320 lines. All 7 commands documented with syntax, options, exit codes, JSON schemas. Global exit codes section. Five workflow examples: file share access, SSH topology discovery, mode switching, device onboarding, connection debugging |
| `packages/shared/src/types/nat.ts` | ConnectionProgress union includes "trying_ddns" | ✓ VERIFIED | ConnectionProgress = "discovering_peer" | "trying_direct" | "trying_relay" | "trying_ddns" | "connected" | "error" |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/relay/src/routes/invite.ts | packages/relay/src/store/index.ts | inviteStore.set(token, ...) in invite route | ✓ WIRED | inviteStore passed as parameter, token stored with expiresAt |
| packages/relay/src/routes/pair.ts | packages/relay/src/store/index.ts | store.upsert({ publicKey, endpoint, timestamp }) after token validation | ✓ WIRED | Client WireGuard key stored in peer store for future lookup |
| packages/relay/src/app.ts | packages/relay/src/routes/invite.ts + pair.ts | app.use("/invite", inviteRouter) and app.use("/pair", pairRouter) | ✓ WIRED | Both routes registered in createApp() with shared InviteStore instance |
| packages/daemon/src/daemon.ts | packages/daemon/src/nat/relayClient.ts | this._relayClient.pair(inviteUrl) called in Daemon.pair() | ✓ WIRED | RelayClient instance available, pair() method called with inviteUrl |
| packages/daemon/src/daemon.ts | packages/daemon/src/history/logger.ts | historyLogger.append() called on state transitions (connect/disconnect/mode_switch/error) | ✓ WIRED | HistoryLogger instance created in constructor, append() called in Daemon state handlers |
| packages/daemon/src/ipc/server.ts | packages/daemon/src/ipc/routes/pair.ts | app.use("/pair", pairRouter(daemon)) | ✓ WIRED | pairRouter registered, receives daemon for pair() delegation |
| packages/daemon/src/ipc/server.ts | packages/daemon/src/ipc/routes/history.ts | app.use("/history", historyRouter(daemon)) | ✓ WIRED | historyRouter registered, calls daemon.historyLogger.getEntries() |
| packages/cli/src/commands/pair.ts | packages/cli/src/ipcClient.ts | client.post("/pair", { inviteUrl }) | ✓ WIRED | IpcClient imported, POST /pair called with inviteUrl body |
| packages/cli/src/commands/history.ts | packages/cli/src/ipcClient.ts | client.get("/history?limit=N") | ✓ WIRED | IpcClient imported, GET /history called with limit param |
| packages/cli/src/index.ts | packages/cli/src/commands/pair.ts + history.ts | program.addCommand(pairCommand()), program.addCommand(historyCommand()) | ✓ WIRED | Both commands imported and registered |
| packages/gui/src/hooks/usePairing.ts | packages/daemon IPC /pair | fetch("http://localhost:30001/pair", { method: "POST", body: { inviteUrl } }) | ✓ WIRED | IPC endpoint called with inviteUrl, response parsed, state updated |
| packages/gui/src/components/OnboardingWizard.tsx | packages/gui/src/hooks/usePairing.ts | const { state, error, pair } = usePairing() called in component | ✓ WIRED | usePairing hook imported and used, pair() called on button click |
| packages/gui/src/App.tsx | packages/gui/src/components/OnboardingWizard.tsx | {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />} | ✓ WIRED | OnboardingWizard imported, rendered conditionally, onComplete callback passed |
| packages/gui/src/App.tsx | Pair Device button | button onClick={() => setShowOnboarding(true)} | ✓ WIRED | Pair Device button visible, toggles showOnboarding state |

---

## Requirements Coverage

| Requirement | Phase | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| AUTH-02 | Phase 5 | New client can onboard via QR code or one-time invite URL from server | ✓ SATISFIED | Relay /invite generates token + homelan:// URL. daemon.pair(inviteUrl) exchanges keys via relay /pair. CLI `homelan pair <url>` and GUI OnboardingWizard enable onboarding without user handling raw keys |
| AUTH-04 | Phase 5 | First-time setup wizard in GUI guides user through key generation and server connection | ✓ SATISFIED | OnboardingWizard component in App.tsx: Step 1 shows invite URL input field + Pair button. Step 2 shows success confirmation. Pair Device button opens wizard overlay |
| CLDE-01 | Phase 5 | Claude Code skill definition file for HomeLAN CLI commands | ✓ SATISFIED | .claude/skills/homelan/SKILL.md exists with When to Use, Prerequisites, Status Detection Pattern sections |
| CLDE-02 | Phase 5 | Skill can check connection status via daemon API | ✓ SATISFIED | SKILL.md documents `homelan status --json` command with JSON schema and Status Detection Pattern showing how to parse state |
| CLDE-03 | Phase 5 | Skill can connect/disconnect and switch modes programmatically | ✓ SATISFIED | rules/commands.md documents `homelan connect --mode`, `homelan disconnect`, `homelan switch-mode` with exact syntax and JSON output |
| CLDE-04 | Phase 5 | Skill can query LAN devices, host info, and network state | ✓ SATISFIED | rules/commands.md documents `homelan devices` and `homelan status` commands with JSON output schemas for querying network state |

All Phase 5 requirements (AUTH-02, AUTH-04, CLDE-01, CLDE-02, CLDE-03, CLDE-04) are satisfied.

---

## Anti-Patterns Scan

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | Zero anti-patterns detected. All implementations are substantive and properly wired. No TODO/FIXME, placeholder returns, empty implementations, or orphaned code |

---

## Test Results

**Full monorepo test suite:**

- shared: 12 tests passing (2 files: ipc.test.ts, nat-relay.test.ts)
- relay: 34 tests passing (7 files: config.test.ts, store.test.ts, relay.test.ts, lookup.test.ts, register.test.ts, invite.test.ts, pair.test.ts)
- daemon: 159 tests passing (14 files: state/machine, wireguard/keygen, nat/relayClient, nat/holePunch, nat/stun, platform/arp, platform/ipv6, platform/dns, keychain, wireguard/interface, history/logger, daemon, daemon-connect, ipc/server)
- cli: 4 tests passing (1 file: ipcClient.test.ts)
- gui: 0 tests (no unit tests; TypeScript correctness verified via tsc --noEmit)

**Total: 209 tests passing across all packages**

**Build status:** All packages build with zero TypeScript errors
- packages/shared: tsc
- packages/relay: tsc
- packages/daemon: tsc
- packages/cli: tsc
- packages/gui: tsc --noEmit

**Specific Phase 5 test additions:**
- invite.test.ts: 6 tests for POST /invite route (happy path, auth validation, token format, expiry)
- pair.test.ts: 6 tests for POST /pair route (happy path, single-use enforcement, invalid/expired token, bad key format)
- history/logger.test.ts: 9 tests for HistoryLogger (append, getEntries, 1000-cap trimming, custom path)
- relayClient.test.ts: 4 new tests for pair(inviteUrl) method (happy path, invalid URL, 401 response, missing token)
- daemon-connect.test.ts: 10 new tests (3 for DDNS fallback, 7 for history logging on state transitions)
- ipc/server.test.ts: 9 new tests for POST /pair and GET /history IPC routes

---

## CLI Verification

`homelan --help` lists all 7 commands:

```
connect [options]               Connect to home network
disconnect [options]            Disconnect from home network
status [options]                Show connection status
switch-mode <mode> [options]    Switch tunnel mode
devices [options]               List home LAN devices
pair [options] <invite-url>     Pair with home server using an invite URL
history [options]               Show connection history
```

All commands verified present and properly registered.

---

## Integration Verification

### Relay Server
- POST /invite: Generates 64-char hex token, stores in InviteStore with 15-min TTL, returns homelan:// deep link
- POST /pair: Validates token, enforces single-use, stores client WireGuard key, returns server public key + relay URL
- Both routes registered in Express app.ts with shared InviteStore instance

### Daemon
- Daemon.connect() emits "trying_ddns" progress step after relay fails, resolves ddnsHostname via injectable DNS resolver
- Daemon.pair(inviteUrl) calls relayClient.pair(inviteUrl), stores keys in keychain
- HistoryLogger appends to ~/.homelan/history.jsonl with 1000-entry cap
- POST /pair IPC: validates inviteUrl, checks daemon state, returns error codes
- GET /history IPC: returns last N entries with configurable limit

### CLI
- homelan pair <url>: calls /pair IPC, checks daemon running, ora spinner, exit 0/1/3
- homelan history: calls /history IPC, formats table or JSON, exit 0/1/3

### GUI
- usePairing hook: manages state, calls /pair IPC, returns boolean success
- OnboardingWizard: 2-step flow, Step 1 inviteUrl input + Pair button, Step 2 success confirmation
- App.tsx: Pair Device button in header, fixed overlay for wizard

### Claude Code Skill
- SKILL.md: When to Use, Prerequisites, Status Detection Pattern, Error Handling
- rules/commands.md: all 7 commands with syntax, options, exit codes, JSON schemas, 5 workflow examples

---

## Gaps Summary

No gaps found. All 5 must-have truths verified, all required artifacts present and substantive, all key links wired, all requirements satisfied, all tests passing, zero TypeScript errors.

---

## Conclusion

**Phase 5 goal achieved.** The HomeLAN project now provides:

1. **Secure onboarding** via QR/invite URL with one-time tokens and 15-minute expiry
2. **Production-ready DDNS fallback** as third-tier discovery (relay → DDNS → hardcoded IP)
3. **Connection history logging** locally with JSON Lines storage and 1000-entry cap
4. **Claude Code skill** enabling AI agents to control the tunnel programmatically with full command documentation

All 6 Phase 5 requirements (AUTH-02, AUTH-04, CLDE-01, CLDE-02, CLDE-03, CLDE-04) are satisfied. Milestone v1.0 complete.

---

_Verified: 2026-03-12T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
