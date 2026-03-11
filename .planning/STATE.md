---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 02-03-PLAN.md
last_updated: "2026-03-11T20:19:51.107Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 11
  completed_plans: 8
  percent: 73
---

# HomeLAN Project State

**Project:** Personal VPN/Tunnel Tool
**Created:** 2026-03-11
**Current Milestone:** Planning Phase

---

## Project Reference

**Core Value:** Seamlessly access home LAN resources (SMB shares, local services, SSH) from anywhere, with a single click or CLI command, in the right mode for the situation.

**Key Constraint:** WireGuard-based tunnel with flexible key-based auth (no user accounts), supporting two modes (Full Gateway vs LAN-Only).

**Home Network Context:**
- Windows desktop (192.168.7.101)
- Mac Mini M4 (192.168.7.102)
- Linux VM (172.24.174.17)
- Fire TV (192.168.7.152)

**Primary Use Case:** Claude Code (AI agent) needs to programmatically connect to host network to access local APIs, file shares, and SSH.

---

## Current Position

**Milestone:** Phase 2 In Progress
**Active Phase:** 02-tunnel-connectivity-nat-traversal
**Plan:** 02-03 COMPLETE — Core tunnel connection logic (holePunch + Daemon.connect/disconnect + IPC routes)
**Stopped At:** Completed 02-03-PLAN.md

**Progress:** [███████░░░] 73% (8/11 plans done)

```
Phase 1: Relay & Daemon Foundation       ██████████  Plan 5/5 done (COMPLETE)
Phase 2: Tunnel + NAT + CLI             ███░░░░░░░  Plan 3/5 done (In Progress)
Phase 3: Mode Switching + Discovery     ░░░░░░░░░░  0%
Phase 4: Desktop GUI                    ░░░░░░░░░░  0%
Phase 5: Onboarding + Fallback          ░░░░░░░░░░  0%

Overall: 21/49 requirements completed (RELY-01..04, DAEM-01..06, AUTH-01, AUTH-03, NAT-01..05, TUNL-01)
```

---

## Phase Overview

| Phase | Objective | Key Deliverables | Req Count |
|-------|-----------|------------------|-----------|
| 1 | Relay & Daemon Foundation | Relay server (Express, HTTPS), Daemon core (WireGuard lifecycle, keychain, IPC) | 12 |
| 2 | Tunnel + NAT + CLI | P2P tunnel, hole punching + relay fallback, CLI commands (connect, disconnect, status) | 17 |
| 3 | Mode Switching + Discovery | Mode switching (routing rules), device discovery (hostname, IP, type), CLI mode commands | 6 |
| 4 | Desktop GUI | Tauri + React app (Windows, macOS), connect/disconnect, mode toggle, status display | 7 |
| 5 | Onboarding + Fallback + Skill | Key setup (QR/URL), DDNS fallback, Claude Code skill definition, connection history | 7 |

---

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| WireGuard over OpenVPN | Faster, simpler, modern, kernel-level performance | Confirmed |
| Relay-first discovery | Avoids port-forwarding complexity; DDNS as fallback | Confirmed |
| Tauri + React for GUI | Smaller bundle (10MB vs 100MB), lower memory footprint (50MB vs 150-300MB), future iOS/Android support | Confirmed |
| WireGuard keys only for auth | Simplicity; key exchange via relay handles onboarding | Confirmed |
| Coarse-grained phases | Compress aggressively: relay + daemon together, tunnel + NAT + CLI together | Confirmed |
| Plain pnpm workspaces over Turborepo/Nx | Sufficient for project size, no extra tooling overhead | 01-01 |
| WireguardKeypair has no privateKey field | Private key never leaves daemon, enforced at type level | 01-01 |
| IpcStatusResponse = DaemonStatus type alias | Daemon is single source of truth, no separate IPC schema drift | 01-01 |
| createStore() async with dynamic import | Keeps better-sqlite3 native module out of serverless bundle for Vercel | 01-02 |
| Hand-rolled rate limiter (no express-rate-limit) | Zero extra dependencies; trivial Map + timestamp logic sufficient | 01-02 |
| httpsOnly skips in NODE_ENV=development | Local testing without TLS termination requires bypass | 01-02 |
| generateKeypair() uses Node.js built-in crypto (X25519) | wireguard-tools@0.3 does not exist; package internals use unsafe shell interpolation; Node.js crypto produces identical Curve25519 keys with no binary dependency | 01-03 |
| All daemon shell calls use execFileSafe(cmd, argsArray) | Args never interpolated into shell string — prevents command injection at the type+pattern level | 01-03 |
| FileKeystore is canonical test double for OS keychain | Windows/macOS backends are integration-only; all unit tests use FileKeystore for CI safety | 01-03 |
| SSE tests use http.Server + collectSse() helper | supertest buffer/parse API does not emit data events for streaming responses in this environment | 01-04 |
| Explicit Router/Express return types on all factories | TS2742 portability error from inferred express-serve-static-core references under NodeNext + declarationMap | 01-04 |
| derivePublicKeyFromPrivate() reconstructs PKCS8 DER | Avoids storing public key separately and avoids wg binary dependency in Daemon class | 01-04 |
| vitest --passWithNoTests for empty packages | Prevents pnpm -r test exit code 1 from cli/gui packages with no tests yet in Phase 1 | 01-05 |
| createRelayHandler accepts pairingTimeoutMs option | Enables fast test (200ms) without mocking timers; production default is 10s | 02-02 |
| Binary WS frames proxied as-is with isBinary flag | Preserves WireGuard UDP frame integrity; no re-encoding overhead | 02-02 |
| Raw dgram STUN client (no external library) | Zero new npm dependencies; dgram is built-in and sufficient for RFC 5389 parsing | 02-01 |
| Native fetch for RelayClient | Node.js 22 LTS ships fetch built-in; eliminates node-fetch dependency | 02-01 |
| lookup() uses verbatim public key in URL | encodeURIComponent breaks base64 = padding matching on relay server | 02-01 |
| startAutoRenew() catches errors silently | Daemon stays running during temporary relay outages; errors logged but not thrown | 02-01 |
| Relay fallback endpoint = relay URL host:port | Relay proxies WG frames on same host; no separate config field needed | 02-03 |
| holePunchFn injected into Daemon | Consistent with wgInterface injection pattern; enables unit-test isolation without module mocking | 02-03 |
| IPC /connect reads config from env vars | RELAY_URL/RELAY_SECRET/PEER_PUBLIC_KEY from environment; simple for Phase 2 CLI | 02-03 |
| Daemon transitions to error on connect() failure | Explicit error→idle reset path; callers (CLI/GUI) handle recovery | 02-03 |

---

## Critical Path Dependencies

1. **Phase 1 → Phase 2**: Relay must be deployed and functioning before clients can discover peers
2. **Phase 2 → Phase 3**: NAT traversal and tunnel stability required before mode switching can be tested
3. **Phase 2 → Phase 4**: Daemon IPC must be stable before GUI can consume it
4. **Phase 3 & 4 can proceed in parallel** with Phase 2 (mode switching and GUI both depend on Phase 2 only)
5. **Phase 5 depends on Phases 2, 4**: Onboarding UI needs GUI; fallback routing needs Phase 3; skill depends on CLI from Phase 2

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Symmetric NAT breaks hole punching (30-50% of networks) | Clients stuck in "connecting" state | Aggressive timeout (3-5s), mandatory relay fallback, test on actual symmetric NAT |
| DNS leaks expose browsing to ISP | Privacy violation in Full Gateway mode | Explicit per-mode DNS config, test on dual-stack networks |
| IPv6 routes bypass tunnel, exposing real IP | Privacy violation | Disable IPv6 entirely in v1, plan full IPv6 support for v2 |
| Relay server single point of failure | Complete block if relay unreachable | Three-tier fallback (relay → DDNS → hardcoded IP), client-side health checks |
| GUI and CLI state desynchronization | User confusion (CLI says connected, GUI says disconnected) | Daemon is single source of truth, event-based IPC, atomic state transitions |

---

## Technology Stack

**Relay Server & Daemon:**
- Node.js 22.x LTS (runtime)
- TypeScript 5.x (strict mode, type safety)
- Express.js 5.x (relay HTTP server)
- Commander.js 12.x (CLI argument parsing)
- node:crypto generateKeyPairSync (WireGuard X25519 keygen, no binary dep)

**Desktop GUI:**
- Tauri 2.10.x (cross-platform, native OS WebView, Rust backend)
- React 19.x (frontend)
- Tailwind CSS + shadcn/ui (styling)
- TanStack Query (optional, data fetching)

**VPN Core:**
- WireGuard (encryption: ChaCha20-Poly1305, keys: Curve25519)
- wireguard-go (userspace fallback on unsupported platforms)
- Native OS APIs (Windows VPN API, macOS NetworkExtension)

**Testing:**
- Vitest (unit tests)
- Playwright (end-to-end desktop tests)
- Manual symmetric NAT testing (AWS EC2 or CGNAT)

---

## Research Findings Summary

**Stack Confidence:** HIGH - All technologies are mature LTS/stable versions, production-proven in similar projects.

**Feature Confidence:** HIGH - Analyzed Tailscale, ZeroTier, Nebula. Table-stakes features align with all three. Differentiators (mode switching, self-hosted relay, no SaaS) validated.

**Architecture Confidence:** HIGH - Control plane/data plane separation is industry standard. IPC patterns proven in Mullvad, OpenVPN3, WireGuard clients.

**Pitfall Mitigation:** MEDIUM-HIGH - Top 5 pitfalls identified and mitigations planned. Only uncertainty: Tauri-specific desktop integration (Phase 4), which will be validated during implementation.

**Phase Structure:** RECOMMENDED - Relay-first (dependency), Daemon+NAT second (core), Mode Switching third (differentiator), GUI fourth (visual layer), Onboarding+Fallback fifth (polish).

---

## Upcoming Milestones

1. **Phase 1 Planning** → `/gsd:plan-phase 1`
   - Task: Relay server architecture (Express, HTTPS, config validation)
   - Task: Daemon core (WireGuard interface, keychain, IPC server)
   - Task: Authentication foundation (key generation)

2. **Phase 1 Implementation**
   - Deliverable: Relay server running on Vercel/VPS
   - Deliverable: Daemon can start, generate keys, respond to IPC queries

3. **Phase 2 Planning** → `/gsd:plan-phase 2`
   - Task: Peer discovery (relay client, STUN, endpoint lookup)
   - Task: NAT traversal (hole punching, fallback logic)
   - Task: CLI commands (connect, disconnect, status, modes)

... and so on through Phase 5.

---

## Session Notes

**2026-03-11 - Roadmap Creation**
- Read PROJECT.md, REQUIREMENTS.md, research/SUMMARY.md
- Extracted 46 v1 requirements across 7 categories
- Identified 5 natural phase boundaries using coarse granularity
- Derived 24 success criteria (observable user behaviors) across all phases
- Mapped 100% of requirements (46/46) to phases with zero orphans
- Created ROADMAP.md, STATE.md, updated REQUIREMENTS.md traceability
- Ready for `/gsd:plan-phase 1`

**2026-03-11 - Plan 01-01 Execution (4 min)**
- Bootstrapped pnpm monorepo with workspaces (package.json, pnpm-workspace.yaml, tsconfig.base.json)
- Created @homelan/shared package with 17 type exports across relay, daemon, IPC/SSE files
- 6 type-level vitest tests passing, verifying all contracts
- relay and daemon packages linked to shared via workspace:* dependency
- Completed requirements: DAEM-04, DAEM-05, DAEM-06, AUTH-01

**2026-03-11 - Plan 01-02 Execution (15 min)**
- Built Express relay server with POST /register, GET /lookup/:publicKey, GET /health
- Config validation via zod (fails fast on missing RELAY_SECRET, defaults for optional vars)
- SQLiteStore (better-sqlite3) + MemoryStore backends with TTL-based expiry
- httpsOnly middleware, in-memory rate limiter (100 req/min)
- vercel.json + Dockerfile for serverless and VPS deployment
- 18 tests passing across config, store, and route test suites
- Completed requirements: RELY-01, RELY-02, RELY-03, RELY-04, AUTH-03

---

*State initialized: 2026-03-11*
**2026-03-11 - Plan 01-03 Execution (9 min)**
- Implemented execFileSafe (execFile with args array, no shell injection) as sole shell executor
- KeychainStore abstraction with Windows Credential Manager, macOS security CLI, and FileKeystore backends
- generateKeypair() via Node.js built-in crypto (X25519) - no wg binary needed in dev/test
- WireGuardInterface with configure/up/down/status and injected ShellExecutor for testability
- StateMachine with VALID_TRANSITIONS table, StateTransitionError, synchronous listeners
- 34 tests passing, TypeScript strict mode zero errors
- Completed requirements: DAEM-01, DAEM-02, AUTH-01

---

**2026-03-11 - Plan 01-04 Execution (6 min)**
- Built Express IPC server with GET /status, GET /devices, GET /events (SSE), GET /health
- POST /connect, /disconnect, /switch-mode stubs returning 501 NOT_IMPLEMENTED
- Daemon class wires KeychainStore + StateMachine; generates/retrieves X25519 keypair; derivePublicKeyFromPrivate() via PKCS8 DER reconstruction
- index.ts entry point: binds 127.0.0.1:30001, SIGTERM/SIGINT graceful shutdown
- 61 tests passing (34 prior + 14 IPC server + 13 daemon), TypeScript build zero errors
- Completed requirements: DAEM-03, DAEM-04, DAEM-05, DAEM-06

---

**2026-03-11 - Plan 01-05 Execution (5 min)**
- Full build + test verification: shared (6), relay (18), daemon (61) — 85/85 tests passing
- Fixed pnpm -r test workspace command: added --passWithNoTests to cli and gui vitest scripts
- Human verification checkpoint auto-approved in auto mode
- Phase 1 gate PASSED — all 12 requirements verified (RELY-01..04, DAEM-01..06, AUTH-01, AUTH-03)
- Phase 2 (Tunnel + NAT + CLI) can now begin

---

**2026-03-11 - Plan 02-01 Execution (3 min)**
- Built pure-Node.js STUN client (node:dgram, RFC 5389 XOR-MAPPED-ADDRESS) with no external dependencies
- Built RelayClient using native fetch (Node.js 22 built-in): register(), lookup(), startAutoRenew()
- Added StunResult, ConnectionProgress, NatTraversalConfig types to @homelan/shared
- 69 tests passing (61 prior + 3 STUN + 5 relay client), TypeScript build zero errors
- Completed requirements: NAT-01, NAT-02, NAT-04, NAT-05

---

*State initialized: 2026-03-11*
*Last updated: 2026-03-11 after Plan 02-01 (NAT discovery layer)*

**2026-03-11 - Plan 02-02 Execution (5 min)**
- Added ws@^8.17.0 runtime dep and @types/ws devDep to relay package
- Created createRelayHandler() in routes/relay.ts: JSON handshake validation, peer pairing by sessionToken, binary frame proxy, disconnect propagation, configurable pairing timeout
- Refactored index.ts from app.listen() to http.createServer() + server.on("upgrade") for WebSocket coexistence on same port
- Re-exported createRelayHandler from app.ts for convenience
- 22 tests passing (18 existing HTTP + 4 new WebSocket tests), TypeScript build zero errors
- Completed requirements: NAT-03

---

**2026-03-11 - Plan 02-03 Execution (5 min)**
- Built UDP hole punching module (node:dgram, 200ms probe interval, HOMELAN probe packet, success/timeout)
- Implemented Daemon.connect(): STUN→relay register→relay lookup→hole punch→WireGuard up; relay fallback when hole punch fails
- Implemented Daemon.disconnect(): connected→disconnecting→idle, wgInterface.down()
- Added onProgress() event emitter for connection progress (discovering_peer/trying_direct/trying_relay/connected)
- Wired IPC POST /connect and POST /disconnect routes to delegate to daemon (no longer 501)
- Added "connection_progress" to SseEventType in @homelan/shared
- Fixed pre-existing TS strict errors in stun.ts buffer indexing
- 78 tests passing (71 prior + 7 new), TypeScript build zero errors
- Completed requirements: TUNL-01, NAT-01, NAT-02, NAT-03, NAT-05
