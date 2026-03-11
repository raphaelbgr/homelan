# HomeLAN Roadmap

**Project:** Personal VPN/Tunnel Tool (HomeLAN)
**Created:** 2026-03-11
**Granularity:** Coarse
**Total Requirements:** 49 v1

---

## Phases

- [x] **Phase 1: Relay & Daemon Foundation** - Relay server + daemon core infrastructure (completed 2026-03-11)
- [ ] **Phase 2: Tunnel Connectivity & NAT Traversal** - P2P tunnel + automatic discovery + CLI
- [ ] **Phase 3: Mode Switching & Service Discovery** - Full Gateway/LAN-Only routing + device discovery
- [ ] **Phase 4: Desktop GUI** - Tauri + React desktop client for Windows & macOS
- [ ] **Phase 5: Onboarding & Fallback Reliability** - Key setup, DDNS fallback, Claude Code skill

---

## Phase Details

### Phase 1: Relay & Daemon Foundation

**Goal:** Establish the foundational infrastructure—a reliable relay server for peer discovery and a daemon that manages WireGuard keys, interface lifecycle, and IPC communication.

**Depends on:** None (first phase)

**Requirements:** RELY-01, RELY-02, RELY-03, RELY-04, DAEM-01, DAEM-02, DAEM-03, DAEM-04, DAEM-05, DAEM-06, AUTH-01, AUTH-03

**Success Criteria:**
1. User can deploy relay server to Vercel or self-hosted VPS and it accepts HTTPS peer registration/lookup requests without errors
2. Daemon can start as background process and persistently store WireGuard keys in OS keychain (encrypted, not plaintext)
3. CLI can query daemon status via localhost HTTP IPC and receive accurate JSON response (daemon is single source of truth for state)
4. Relay server validates configuration at startup and fails fast with clear error messages (TLS cert, endpoints, required fields)
5. Daemon generates new WireGuard keypairs on first run and can list them securely from keychain

**Plans:** 5/5 plans complete

Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold + shared TypeScript contracts
- [ ] 01-02-PLAN.md — Relay server (Express, register/lookup API, config validation, SQLite/memory store)
- [ ] 01-03-PLAN.md — Daemon key management (OS keychain, WireGuard key gen, interface lifecycle, state machine)
- [ ] 01-04-PLAN.md — Daemon IPC server (localhost:30001, REST endpoints, SSE events stream)
- [ ] 01-05-PLAN.md — Integration verification checkpoint (full test suite + human smoke test)

---

### Phase 2: Tunnel Connectivity & NAT Traversal

**Goal:** Deliver end-to-end encrypted P2P connectivity with automatic peer discovery, hole punching fallback, and CLI commands to control the tunnel. User can connect and stay connected even behind NAT.

**Depends on:** Phase 1

**Requirements:** TUNL-01, TUNL-02, TUNL-03, TUNL-05, TUNL-06, TUNL-08, TUNL-09, NAT-01, NAT-02, NAT-03, NAT-04, NAT-05, CLI-01, CLI-02, CLI-03, CLI-06, CLI-07

**Success Criteria:**
1. User runs `homelan connect --mode full-gateway` and the tunnel establishes within 10 seconds; user can ping home LAN devices by IP
2. User runs `homelan disconnect` and the tunnel closes, reverting to normal internet (no DNS leaks, no IPv6 routes persist)
3. Client automatically discovers home server via relay within 5 seconds; if relay is unreachable, attempts direct hole punching for 3-5 seconds then falls back to relay
4. DNS queries are routed to home network's DNS in Full Gateway mode; ISP DNS in LAN-Only mode (explicit per-mode configuration prevents leaks)
5. IPv6 is disabled entirely in tunnel to prevent real IP leaks; user confirms tunnel is IPv6-safe with test tool
6. `homelan status` returns JSON with connection state, current mode, latency, and throughput; output is machine-readable and reliable

**Plans:** 2/6 plans executed

Plans:
- [ ] 02-01-PLAN.md — STUN client (RFC 5389) + relay HTTP client (register/lookup/auto-renew) in daemon
- [ ] 02-02-PLAN.md — WebSocket UDP relay endpoint on relay server (/relay route, peer pairing by sessionToken)
- [ ] 02-03-PLAN.md — Daemon.connect() + Daemon.disconnect() + UDP hole punch + IPC route wiring (no more 501s)
- [ ] 02-04-PLAN.md — DNS configurator + IPv6 blocker platform handlers (netsh/networksetup), wired into daemon
- [ ] 02-05-PLAN.md — CLI package: homelan connect/disconnect/status with spinner, exit codes, --json flag
- [ ] 02-06-PLAN.md — Phase 2 integration verification (full test suite + human smoke test)

---

### Phase 3: Mode Switching & Service Discovery

**Goal:** Enable seamless switching between Full Gateway (all internet via home) and LAN-Only (only LAN via tunnel) modes, plus human-readable device discovery on the home network.

**Depends on:** Phase 2

**Requirements:** TUNL-07, DISC-01, DISC-02, DISC-03, CLI-04, CLI-05

**Success Criteria:**
1. User runs `homelan switch-mode lan-only` while connected and mode switches in <1 second without dropping the tunnel
2. User queries `homelan devices` and sees home network devices with human-readable names (hostname), IPs, and device type (e.g., "Mac Mini - 192.168.7.102")
3. Device list updates automatically while connected (daemon polls home network for new/removed devices); user runs command multiple times and sees additions reflected
4. Routing tables are correctly configured per mode: Full Gateway routes default 0.0.0.0/0 via tunnel except local subnet; LAN-Only routes only home subnet via tunnel

**Plans:** TBD

---

### Phase 4: Desktop GUI

**Goal:** Deliver a single-click desktop client (Tauri + React) for Windows and macOS that surfaces core functionality with clear visual feedback and real-time status.

**Depends on:** Phase 2, Phase 3 (can start in parallel with Phase 3)

**Requirements:** TUNL-04, GUI-01, GUI-02, GUI-03, GUI-04, GUI-05, GUI-06, GUI-07

**Success Criteria:**
1. User opens desktop app on Windows or macOS and sees Connect/Disconnect button; clicking Connect establishes tunnel and button state updates in real-time
2. User sees mode toggle (Full Gateway / LAN-Only) with clear descriptions; toggling changes mode without reconnecting
3. Dashboard displays live connection status: connected/disconnected, current mode, latency (ms), and data throughput (optional)
4. Connection progress indicator shows real-time feedback during connect attempt (e.g., "Discovering peer...", "Testing direct connection...", "Using relay")
5. Error states are shown with actionable messages (e.g., "Relay unreachable. Check network connection." instead of generic errors)
6. System tray icon shows connection state (connected/disconnected); clicking tray icon toggles connection or opens app

**Plans:** TBD

---

### Phase 5: Onboarding & Fallback Reliability

**Goal:** Smooth first-user experience with secure key setup, production-ready fallback mechanisms (DDNS secondary discovery), and Claude Code skill integration.

**Depends on:** Phase 2, Phase 4

**Requirements:** AUTH-02, AUTH-04, CLDE-01, CLDE-02, CLDE-03, CLDE-04

**Success Criteria:**
1. New user runs initial setup: relay generates one-time invite URL or QR code; user scans QR on new device and keys are exchanged securely via HTTPS (user never handles raw keys)
2. User opens GUI for first time and onboarding wizard guides through server connection setup; after completion, user can connect without manual configuration
3. If relay server is unavailable, client automatically falls back to DDNS lookup (if configured) or hardcoded IP; user sees "Relay unavailable, trying DDNS..." in status
4. Claude Code skill can invoke `homelan connect/disconnect/switch-mode/status` and retrieve machine-readable output for automation
5. Connection history is logged locally (dates, times, modes, durations); user can view past connection sessions for debugging

**Plans:** TBD

---

## Progress Tracking

| Phase | Goal | Requirements | Success Criteria | Plans Complete | Status |
|-------|------|--------------|------------------|-----------------|--------|
| 1 | 5/5 | Complete   | 2026-03-11 | 0/5 | Planned |
| 2 | 2/6 | In Progress|  | 0/6 | Planned |
| 3 | Mode Switching + Discovery | 6 | 4 | 0/? | Not started |
| 4 | Desktop GUI | 8 | 6 | 0/? | Not started |
| 5 | Onboarding + Fallback + Claude | 6 | 5 | 0/? | Not started |

**Total Coverage:** 49/49 requirements mapped ✓

---

*Roadmap created: 2026-03-11*
*Last updated: 2026-03-11 after Phase 2 planning*
*Granularity: Coarse (5 phases, 6-17 requirements per phase)*
*Research-informed structure: Relay first (dependency), Daemon+NAT second (core functionality), Mode Switching third (differentiator), GUI fourth (visual layer), Onboarding+Fallback fifth (polish)*
