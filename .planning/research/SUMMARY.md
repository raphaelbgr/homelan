# Project Research Summary

**Project:** Personal VPN/Tunnel Tool (HomeLAN)
**Domain:** Cross-platform VPN client for secure LAN access from remote locations
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

Building a personal VPN tunnel is a well-established architectural pattern, proven by Tailscale, ZeroTier, and Nebula. The recommended approach uses **WireGuard for encryption** (modern, audited, fast), a **lightweight self-hosted relay server** for peer discovery (no vendor lock-in), and **desktop clients** (GUI via Tauri + React, CLI via Node.js) for cross-platform control. This is a realistic v1 MVP that validates core value—seamless access to home LAN from anywhere—without overengineering.

The primary risks are technical rather than architectural: NAT traversal failures on symmetric networks, DNS leaks exposing ISP visibility, IPv6 address leaks, relay server becoming a single point of failure, and state synchronization bugs between GUI and CLI. These are all well-understood pitfalls with standard mitigations. The roadmap should front-load relay server reliability and aggressive fallback logic (Pitfall #1, #4), followed by secure key management and careful mode-switching routing (Pitfalls #2, #3, #5).

Success depends on shipping a **minimal but complete** v1: tunnel connectivity + mode switching (Full Gateway / LAN-Only) + basic GUI + CLI, with rock-solid fallback behavior when things go wrong. Scale beyond 10 home devices is deferred to v2; mobile (iOS/Android) deferred pending Tauri support maturation.

---

## Key Findings

### Recommended Stack

**Core Technologies:**
- **Node.js 22.x LTS** (or 24.x after May 2025): Runtime for relay server, CLI, and backend services. LTS guarantees 30 months of critical updates; even-numbered versions are stable production.
- **TypeScript 5.x (strict mode)**: Mandatory for type safety in security-critical code. Reduces silent bugs in key management and connection logic.
- **Tauri 2.10.x** (not Electron): Desktop GUI framework. Builds to ~10MB installer vs Electron's 100MB+. Uses native OS WebView + Rust backend. 50MB idle RAM vs Electron's 150-300MB. Future-proof for mobile via Tauri 2.x iOS/Android support.
- **React 19.x**: Frontend for Tauri GUI. Mature ecosystem, seamless Tauri integration, component reusability.
- **WireGuard** (kernel module + wireguard-go): VPN protocol. Modern cryptography (Noise), simpler attack surface than OpenVPN, kernel-level performance. Key-based auth (no user accounts needed).
- **Express.js 5.x**: HTTP server for relay service. Lightweight, trivial deployment to Vercel/free tier. Sufficient for stateless peer discovery.
- **Commander.js 12.x**: CLI argument parsing. Ideal for 5-10 commands (connect, disconnect, switch-mode, status).
- **wireguard-tools**: Key generation and config management. Pure JavaScript, no native binary dependencies.

**Why This Stack:**
- Single tech stack across all components (Node + TypeScript) reduces context switching and enables code sharing between daemon, relay, CLI.
- Tauri + React chosen over Electron for dramatic bundle/memory savings. Team can ship updates faster, users install smaller packages.
- WireGuard is industry standard (Tailscale, commercial VPN vendors use it). Simpler than OpenVPN, audited by security researchers.
- Free-tier deployment: Relay runs on Vercel (auto-scaling, TLS included, $0 hobby tier).
- Testing infrastructure: Vitest for unit tests, Playwright for end-to-end.

**Implementation confidence:** HIGH. All technologies are mature, official docs comprehensive, production-proven in similar projects.

---

### Expected Features

**Must Have (v1 Table Stakes):**
- **Connect/Disconnect**: Core VPN on/off control. Without this, nothing else matters. Required in both CLI and GUI.
- **Stable peer-to-peer tunnel**: WireGuard handles encryption; focus is on reliable peer discovery.
- **NAT Traversal (automatic)**: Hole punching + relay fallback. Users should not see port-forwarding complexity.
- **Mode Switching (Full Gateway ↔ LAN-Only)**: Core differentiator. Full Gateway = all internet through home. LAN-Only = only home LAN through tunnel, normal internet direct.
- **Key-based authentication**: WireGuard keypairs only. No user accounts, passwords, or MFA.
- **Desktop GUI (Windows + macOS)**: Single-click connect. Not CLI-only.
- **CLI**: Required for automation and Claude Code integration.
- **Connection status display**: Current mode, latency, basic metrics.
- **Basic service discovery**: Device naming (human-readable names instead of IPs).
- **Lightweight self-hosted relay**: Deploy on Vercel/free tier; no external SaaS dependency.

**Should Have (v1.x Differentiators):**
- **Dynamic DNS fallback**: Secondary discovery if relay unreachable. Reduces single point of failure.
- **Connection history**: Log connects/disconnects locally for debugging.
- **Bandwidth monitoring hints**: Suggest LAN-Only mode if WAN saturated.

**Defer to v2+ (Out of Scope v1):**
- **Mobile clients (iOS/Android)**: Separate development. Tauri support maturing; wait for desktop to stabilize.
- **Multi-home network support**: Requires mesh coordination. Focus on single home first.
- **User accounts / SSO**: Only if organizational use emerges. WireGuard keys sufficient for personal.
- **Real-time packet logging**: Adds complexity with marginal UX value.

**Feature Confidence:** HIGH. Research analyzed Tailscale, ZeroTier, Nebula feature sets. Table-stakes features align with all three. Differentiators (mode switching, self-hosted relay, no SaaS lock-in) validated against competitor feature gaps.

---

### Architecture Approach

Personal VPN/tunnel systems follow a **control plane / data plane separation** model: a central relay server coordinates peer discovery and distributes routing info, but actual encrypted tunnel traffic flows peer-to-peer directly via WireGuard. The relay is lightweight—just HTTP endpoints for peer registration and lookup. No traffic relay for v1 (encrypted P2P only).

**Major Components:**

1. **Client Daemon** (privileged background process): Core VPN logic running as root/SYSTEM. Manages WireGuard interface configuration, relay/DDNS discovery, key storage, routing table updates (mode switching), metrics collection. Exposes HTTP IPC server on localhost:30001 for GUI/CLI communication.

2. **Relay Server** (stateless HTTP service, deployable independently): Peer discovery, handshake coordination. Endpoints: `/register` (client adds itself), `/lookup` (client queries known peers). No data relay for v1. Must support HTTPS with TLS. Can run on Vercel, AWS Lambda, any VPS.

3. **Desktop GUI** (unprivileged, Tauri + React): Connect/disconnect buttons, mode toggle, status/latency display. Communicates with daemon via HTTP on localhost:30001. Single codebase for Windows + macOS.

4. **CLI Tool** (unprivileged, Node.js + Commander): Commands—connect, disconnect, switch-mode, status, list-peers. Talks to same daemon as GUI. Enables automation and Claude Code integration.

5. **WireGuard Interface** (kernel module or wireguard-go): Encrypted UDP tunnels. ChaCha20-Poly1305 encryption, Curve25519 keys. Cross-platform via native OS APIs (Windows VPN API, macOS NetworkExtension) or wireguard-go userspace fallback.

**Architecture Confidence:** HIGH. Validated against Tailscale/Headscale/NetBird reference implementations. Control plane/data plane separation is industry standard. IPC pattern proven in similar VPN clients (Mullvad, OpenVPN3, WireGuard clients).

---

### Critical Pitfalls to Avoid

Research identified 10 pitfalls; top 5 are most relevant to v1:

1. **Symmetric NAT Breaks Hole Punching, Users Silently Fail** — 30-50% of networks use symmetric NAT where STUN hole punching fails. If no relay fallback, users stuck in perpetual "connecting" state. **Prevention:** Implement aggressive timeouts (3-5s) for hole punching, immediately fall back to relay. Relay is mandatory, not optional. Test on symmetric NAT network.

2. **DNS Leaks Expose Browsing to ISP** — User connects to "Full Gateway" mode but DNS queries still leak to ISP nameserver. Windows split tunneling broadcasts DNS to all adapters. **Prevention:** Explicitly set DNS to home network's DNS server in WireGuard config. Test DNS leaks in both modes before shipping. Document what each mode leaks.

3. **IPv6 Routes Bypass Tunnel, Leaking Real IP** — User enables tunnel but IPv6 traffic still goes direct, exposing ISP IPv6. macOS sometimes routes IPv6 outside tunnel even with ::/0 in AllowedIPs. **Prevention:** For v1, disable IPv6 entirely to prevent leaks. Plan full IPv6 support for v2. Test on dual-stack networks.

4. **Relay Server Single Point of Failure; No Fallback** — Relay unreachable → clients can't discover peers → complete block. No DDNS or local IP fallback. **Prevention:** Three-tier fallback: relay → DDNS → hardcoded home IP. Relay health checks on client side. Timeout/retry logic (5s timeouts).

5. **GUI and CLI State Desynchronized** — User switches mode via CLI, GUI still shows old mode. Or GUI reports "connected" but CLI says "disconnected". **Prevention:** Daemon is single source of truth. All state queries go to daemon, not local client memory. Implement event-based IPC (daemon publishes state changes, GUI/CLI subscribe). Atomic state transitions.

---

## Implications for Roadmap

Based on component dependencies and pitfall mitigation sequence, recommended phase structure:

### Phase 1: Relay Server MVP + Core Daemon Initialization
**Rationale:** Relay must be ready before any client can establish peer discovery. Daemon WireGuard interface management must work end-to-end first.
**Delivers:**
- Relay server HTTP endpoints: `/register`, `/lookup` (HTTPS only, no plaintext)
- Client daemon: WireGuard interface lifecycle, key generation + secure OS keychain storage, basic relay client
- Config validation: Relay validates TLS cert, required fields, fails fast with clear errors
**Addresses Features:** Stable P2P tunnel (foundation), Key-based authentication (key generation)
**Avoids Pitfalls:** #6 (keys stored plaintext), #8 (relay misconfiguration), #4 (prepare for fallback)
**Stack Elements:** Node.js relay (Express), Client daemon foundation, wireguard-tools for key generation
**Testing:** Manual relay reachability, key generation/storage in OS keychain, basic WireGuard interface creation

---

### Phase 2: Client Daemon + NAT Traversal + CLI Tool
**Rationale:** With relay deployed, build daemon relay client and NAT traversal fallback. Build CLI to control daemon and validate IPC. These validate that discovery and connection work end-to-end.
**Delivers:**
- STUN endpoint discovery (via relay provider)
- Direct P2P connection attempts with aggressive timeout (3-5s)
- Relay-assisted UDP fallback if direct fails
- IPC server on localhost:30001 (daemon state = single source of truth)
- CLI commands: `connect`, `disconnect`, `status` (JSON output)
- DNS configuration per mode (explicit home DNS in Full Gateway, ISP DNS fallback in LAN-Only)
- IPv6 disabled entirely (to prevent leaks)
**Addresses Features:** NAT Traversal (automatic), Mode Switching foundation, Connection status, CLI
**Avoids Pitfalls:** #1 (aggressive fallback), #2 (DNS per-mode), #3 (IPv6 disabled), #5 (IPC architecture)
**Stack Elements:** Client daemon (TypeScript), Commander.js CLI, chalk for colors
**Testing:** Test on symmetric NAT, DNS leak test in both modes, IPv6 leak test (verify none), CLI ↔ daemon IPC reliability, concurrent CLI + daemon operations

---

### Phase 3: Mode Switching (Full Gateway ↔ LAN-Only)
**Rationale:** Mode switching is a core differentiator but requires careful routing table management. Daemon IPC and basic CLI established in Phase 2 enable testing.
**Delivers:**
- Routing table configuration: Full Gateway routes default 0.0.0.0/0 via tunnel except local subnet; LAN-Only routes only 192.168.0.0/16 (home subnet) via tunnel
- Mode switching without reconnect (update routing rules only; WireGuard tunnel stays up)
- `personal-tunnel switch-mode {full-gateway|lan-only}` CLI command
- IPC endpoint: `/switch-mode` POST
**Addresses Features:** Mode Switching (core value prop)
**Avoids Pitfalls:** #2 (routing verified per-mode), #5 (IPC state synchronization required)
**Stack Elements:** Daemon routing module (platform-specific: netlink Linux, ip route macOS, Windows routing API)
**Testing:** Verify mode switch completes <1s, DNS/IP routes correct per mode on all three platforms, concurrent mode switch via GUI + CLI (race condition tests)

---

### Phase 4: Desktop GUI (Tauri + React)
**Rationale:** Daemon and CLI proven in Phase 2-3. Now build GUI consuming same daemon via IPC. GUI reuses CLI command structure but adds visual feedback.
**Delivers:**
- Connect/Disconnect buttons
- Mode toggle (Full Gateway / LAN-Only) with clear labels
- Status display: connected/disconnected, current mode, latency, data throughput (if available)
- Real-time status sync from daemon (event subscription, not polling)
- Onboarding: QR code or one-time URL for initial key setup (deferred to Phase 5 if complex)
**Addresses Features:** Desktop GUI, Connection status display
**Avoids Pitfalls:** #5 (event-based IPC), #7 (progress feedback during connect), #10 (clear mode naming with descriptions)
**Stack Elements:** Tauri 2.10, React 19, Tailwind, shadcn/ui, TanStack Query (optional data fetching)
**Testing:** Component tests (Vitest), end-to-end desktop tests (Playwright), cross-platform (Windows + macOS)

---

### Phase 5: Key Onboarding + Fallback Enhancements
**Rationale:** v1 core works; now focus on smooth first-user experience and production reliability.
**Delivers:**
- Initial key exchange: QR code or one-time URL from relay server
- Server-side peer registration: relay validates key, stores mapping
- DDNS fallback: if relay unreachable, client falls back to DDNS lookup
- Connection history logging (local file only, no cloud)
- Improved error messages: "Relay unreachable, trying DDNS...", "Direct connection failed, using relay", etc.
**Addresses Features:** Keyless authentication (smooth setup), Dynamic DNS fallback, Connection history, Service discovery (peer naming)
**Avoids Pitfalls:** #4 (DDNS fallback), #7 (detailed error messages)
**Stack Elements:** Relay key registration endpoints, Client DDNS lookup, local logging
**Testing:** Full key setup flow on fresh machine, relay downtime → DDNS fallback, error message accuracy

---

### Phase 6: Advanced Reliability + Testing
**Rationale:** v1 core + onboarding done. Polish reliability and add comprehensive testing.
**Delivers:**
- Daemon startup race condition fix: CLI retries daemon connection (5 attempts, 1s apart), daemon writes PID file when ready
- Multi-relay failover: support multiple relay servers, try next if one fails
- Comprehensive logging: daemon logs to file with rotation, accessible for debugging
- State recovery: daemon persists last-known state, restores on restart
**Avoids Pitfalls:** #9 (daemon startup race), #4 (multi-relay failover)
**Stack Elements:** Process management (systemd on Linux, launchd on macOS, Windows Service), logging library
**Testing:** Chaos tests (relay failures, network interruptions), state recovery tests, performance tests (relay throughput)

---

### Phase 7: Optional Enhancements (if time permits)
**Rationale:** Core product shipped and validated. Optional features improve UX or add insights.
**Delivers:**
- Bandwidth monitoring: collect throughput metrics, suggest LAN-Only if WAN saturated
- Claude Code skill documentation: publish CLI as official skill for AI agent integration
- Multi-device peer auto-discovery: home server coordinates peer discovery without manual key exchange
**Notes:** These are nice-to-haves. Ship v1 without them if needed to hit launch date.

---

### Phase Ordering Rationale

1. **Relay first (Phase 1):** Relay must exist and be discoverable before any client can work. Also front-loads HTTPS/TLS and config validation (Pitfall #6, #8).

2. **Daemon + NAT Traversal next (Phase 2):** With relay live, validate discovery and fallback work. NAT traversal is the hardest technical problem (Pitfall #1) so address early. CLI validates IPC protocol.

3. **Mode Switching (Phase 3):** Differentiator but depends on daemon IPC being solid. Routing complexity requires careful testing but is well-understood.

4. **GUI after daemon (Phase 4):** GUI reuses daemon commands; no new business logic, just visual layer. Can proceed in parallel with Phase 3 but listed after for clarity.

5. **Onboarding + Fallback (Phase 5):** Once core tunnel works, focus on first-user experience and production resilience. DDNS fallback reduces relay dependency (Pitfall #4).

6. **Reliability + Testing (Phase 6):** Polish for production. Daemon startup race (Pitfall #9), state recovery, comprehensive logging.

7. **Optional enhancements (Phase 7):** Ship v1 without these if needed. Validate core product first.

---

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (NAT Traversal):** WireGuard endpoint discovery and STUN/hole punching mechanics need validation. Consider prototyping hole punching fallback timing before full implementation. Recommendation: research WireGuard's native hole punching capabilities; may not need custom STUN logic if wireguard-go handles it.

- **Phase 3 (Mode Switching):** Platform-specific routing APIs (netlink, ip route, Windows Routing API) are complex. Recommend spike on each platform to validate no-reconnect mode switching is feasible before committing to Phase 3 schedule.

- **Phase 5 (Key Onboarding):** QR code generation and one-time URL flow design needs UX research. Validate users can scan QR on new device without friction. Consider fall back to text-based key export if QR is complex.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Relay Server):** Express.js HTTP server is well-documented. TLS setup on Vercel is standard. Config validation is straightforward. Research not needed beyond reading Express docs.

- **Phase 4 (Desktop GUI):** Tauri + React integration is proven and documented. No novel patterns. Follow official Tauri template. Research not needed.

- **Phase 6 (Reliability):** Daemon process management, logging rotation, state persistence are standard patterns. Research not needed; follow production best practices (systemd, logrotate, file-based persistence).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | All technologies are mature, LTS versions confirmed, production-proven in similar projects. Tauri 2.x stable as of Oct 2024. Node 22 LTS officially supported. |
| **Features** | HIGH | Analyzed feature sets of Tailscale, ZeroTier, Nebula. Table-stakes features consistent across all three. MVP definition aligns with competitive products. |
| **Architecture** | HIGH | Control plane/data plane separation is industry standard. Verified against Tailscale/Headscale/NetBird reference implementations. IPC patterns proven in similar VPN clients. |
| **Pitfalls** | MEDIUM-HIGH | Top 5 pitfalls are well-documented in Tailscale blog + security research. NAT traversal pitfalls especially well-researched. DNS/IPv6 leaks have standard mitigations. GUI/CLI state sync is common distributed systems problem with known solutions. Only concern: Tauri-specific pitfalls (desktop framework integration) need Phase 4 validation. |

**Overall confidence:** HIGH

Rationale: Stack and architecture are conservative (proven technologies). Feature list is well-scoped (single home, no multi-site). Pitfalls are well-understood with documented mitigations. Only wildcard is Tauri desktop integration specifics, which will be validated during Phase 4 but are unlikely to cause major pivots (Tauri is proven in production apps).

---

### Gaps to Address

1. **Exact relay deployment procedure on Vercel:** Research identified Vercel as recommended platform. During Phase 1, validate: free tier supports 24/7 Node.js service? TLS certificates auto-managed? Bandwidth limits sufficient for peer lookup traffic? **Mitigation:** Deploy test relay to Vercel in Phase 1 spike.

2. **WireGuard key distribution method (QR vs text vs one-time URL):** Research suggests QR or one-time URL for smooth onboarding. During Phase 5, validate user experience with actual testers. **Mitigation:** Prototype both approaches, iterate on UX.

3. **IPv6 handling decision:** Research recommends disabling IPv6 in v1 to prevent leaks. During Phase 2, confirm: can IPv6 be safely disabled in WireGuard config on all three platforms? Any user impact? **Mitigation:** Test IPv6 disable on Windows, macOS, Linux in Phase 2 prototype.

4. **Symmetric NAT prevalence in home networks:** Pitfall #1 warns symmetric NAT affects 30-50% of networks. During Phase 2 NAT testing, validate relay fallback timeout thresholds (3-5s) are aggressive enough. **Mitigation:** Test on actual symmetric NAT network (AWS EC2 or ISP with CGNAT).

5. **GUI/daemon IPC latency and reliability:** Pitfall #5 flags state desync. During Phase 4, validate: can daemon handle 10+ concurrent requests from GUI + CLI without race conditions? **Mitigation:** Load test IPC with concurrent commands in Phase 4 spike.

---

## Sources

### Primary (HIGH confidence)
- [Tailscale: How it works](https://tailscale.com/blog/how-tailscale-works) — Control plane/data plane architecture, NAT traversal strategy
- [Tauri 2.0 Release Blog](https://v2.tauri.app/blog/tauri-20/) — Architecture, performance metrics, security features
- [WireGuard Protocol Documentation](https://www.wireguard.com/protocol/) — Cryptography, key distribution, peer authentication
- [Node.js LTS Status](https://nodejs.org/en/about/previous-releases) — Version strategy, LTS timeline
- [Tailscale DERP Relay System](https://tailscale.com/kb/1232/derp-servers/) — Relay architecture reference
- [WireGuard NAT Traversal Guide](https://www.jordanwhited.com/posts/wireguard-endpoint-discovery-nat-traversal/) — Hole punching and fallback patterns

### Secondary (MEDIUM confidence)
- [NetBird Architecture (WireGuard + Go)](https://dasroot.net/posts/2026/02/netbird-architecture-wireguard-go-zero-trust/) — Component boundaries, concurrency patterns
- [Headscale: Self-hosted Tailscale](https://github.com/juanfont/headscale) — Open-source control plane reference
- [Tailscale NAT Traversal Improvements](https://tailscale.com/blog/nat-traversal-improvements-pt-1) — Practical NAT hole punching strategies
- [WireGuard DNS Leak Prevention (Windows)](https://engineerworkshop.com/blog/dont-let-wireguard-dns-leaks-on-windows-compromise-your-security-learn-how-to-fix-it/) — Mode-specific DNS configuration
- [Express.js + TypeScript 2025 Setup](https://medium.com/@gabrieldrouin/node-js-2025-guide-how-to-setup-express-js-with-typescript-eslint-and-prettier-b342cd21c30d) — Modern Node.js server patterns

### Tertiary (Validation needed in Phase 1-2)
- Vercel Node.js free tier limits (to validate relay deployment choice)
- wireguard-tools npm package maturity (used for key generation)
- Tauri 2.x IPC performance under concurrent load (Phase 4 concern)

---

*Research completed: 2026-03-11*
*Summary synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
*Ready for roadmap phase planning: YES*
