# Domain Pitfalls: Personal VPN/Tunnel Tools

**Domain:** Personal VPN/Tunnel (WireGuard-based, relay-assisted, desktop GUI)
**Researched:** 2026-03-11
**Confidence:** MEDIUM (verified with multiple sources; WireGuard/relay patterns well-documented; desktop-specific state management requires validation in Phase 1)

---

## Critical Pitfalls

### Pitfall 1: Symmetric NAT Breaks Hole Punching, Users Silently Fail to Connect

**What goes wrong:**
Users behind symmetric NAT (or Carrier-Grade NAT on mobile) attempt hole punching via STUN but connections fail silently. The client reports "connecting" indefinitely or times out without a clear error message. The server receives no packets from the client because symmetric NAT assigns a new unpredictable port for each destination connection, so the hole punched using STUN is different from the port used for actual peer communication.

**Why it happens:**
Developers assume STUN-based hole punching works universally. In reality, it only works with cone NAT (most residential). Symmetric NAT (30-50% of networks depending on ISP/region) requires TURN relay fallback. If you don't have a relay fallback, symmetric NAT users are stuck in perpetual "connecting" state.

**How to avoid:**
- Implement hole punching detection: if direct connection attempt fails after N seconds, immediately fall back to relay without waiting for timeout.
- Relay server must be mandatory fallback, not optional. Test on symmetric NAT environment (AWS EC2 behind security group simulates this).
- Set aggressive timeouts (3-5 seconds) for hole punching before relay fallback, not 30+ seconds.
- Log hole punch success/failure ratio to detect this in production.

**Warning signs:**
- User reports: "Sometimes it connects, sometimes it doesn't" (indicates STUN works on some networks, fails on others)
- Connection times >15 seconds before success (indicates hole punching + timeout fallback)
- No error messages, just spinner/connecting state
- Geographic patterns in failures (certain ISPs/carriers affected)

**Phase to address:**
Phase 1 (Relay Server MVP) must include fallback relay. Phase 2 (Client MVP) must implement hole punching with fast-fail relay detection.

---

### Pitfall 2: DNS Leaks Expose Browsing to ISP Even While Connected

**What goes wrong:**
User connects to VPN tunnel believing traffic is routed through home network, but DNS queries still leak to ISP nameserver. In split-tunnel mode (LAN-Only), this is expected, but in full-gateway mode, user's ISP sees every domain they access because DNS goes to local ISP server instead of through tunnel. On Windows with split tunneling, WireGuard creates multiple network adapters, and Windows broadcasts DNS queries to all of them.

**Why it happens:**
Developers forget that VPN routing (AllowedIPs in WireGuard) controls IP traffic, not DNS. DNS is handled separately by the OS and defaults to system-configured nameservers. In split-tunnel mode, routing DNS correctly is tricky because you need to control which DNS server handles which domains.

**How to avoid:**
- In full-gateway mode, explicitly set DNS to home network's DNS server in WireGuard client config (Dns= field).
- Verify DNS leaks with DNS leak test tools in every connection mode before shipping.
- For split tunneling, implement per-domain DNS routing (only domain-based splitting, not subnet-based, if DNS control is required).
- Document clearly which mode leaks what (LAN-Only will leak DNS to ISP for non-home-network domains; that's by design).
- Add DNS leak detection in the app: query a test domain, verify it resolves from expected nameserver.

**Warning signs:**
- User reports: "ISP can see what sites I visit even in full-gateway mode"
- DNS leak test shows ISP nameserver answering queries
- Split-tunnel DNS test fails: non-routed domains resolve from ISP, not home DNS
- AllowedIPs configured but DNS test shows leakage

**Phase to address:**
Phase 2 (Client MVP) must configure DNS correctly per mode. Phase 3 (UX Polish) should add DNS leak detection/verification.

---

### Pitfall 3: IPv6 Routes Outside Tunnel, Exposing Real IP Address

**What goes wrong:**
User connects to tunnel, all IPv4 traffic routed correctly, but IPv6 traffic bypasses tunnel entirely, exposing real public IPv6 to internet. User believes they're behind home network's IPv6, but they're actually leaking their ISP's IPv6. On macOS, WireGuard sometimes routes IPv6 outside tunnel even when ::/0 is specified in AllowedIPs.

**Why it happens:**
Developers configure IPv4 AllowedIPs correctly but overlook IPv6. WireGuard's AllowedIPs controls routing, but IPv6 routing on macOS/Linux can be tricky. Some systems have dual-stack DNS (AAAA records), so if you tunnel only IPv4, AAAA queries resolve, client attempts IPv6 connection, and it works — leaking identity.

**How to avoid:**
- Test with IPv6-enabled networks. If home network has IPv6, verify it's correctly routed through tunnel.
- If IPv6 support is not ready, disable IPv6 on the WireGuard interface to prevent leaks.
- Include ::/0 in AllowedIPs if tunneling all traffic, but test it works on target platforms.
- Add test: verify both IPv4 and IPv6 of resolved domains route through tunnel.
- Document IPv6 support status clearly (v1: IPv4 only, IPv6 disabled; v2: full IPv6 support).

**Warning signs:**
- IPv6 leak test shows real ISP IPv6
- macOS users report different behavior than Windows
- Dual-stack domains resolve but only IPv4 is fast (IPv6 leaking, hitting real ISP)
- AllowedIPs includes ::/0 but tcpdump shows IPv6 outside tunnel

**Phase to address:**
Phase 2 (Client MVP) must disable IPv6 or fully support it. Phase 4+ (Advanced Features) can add full IPv6 support with verification.

---

### Pitfall 4: Relay Server Becomes Single Point of Failure; Peer Discovery Never Falls Back

**What goes wrong:**
Relay server is unreachable (maintenance, network issue, provider outage). Clients cannot discover peer endpoints and cannot establish connection. There's no fallback to DDNS or local network discovery. Users are completely blocked.

**Why it happens:**
Relay server is designed as the handshake/discovery mechanism, but developers don't implement fallback. If relay is down, peer discovery fails, and DDNS fallback is not triggered. In a personal/hobby project, "relay is optional" is often assumed, but then it becomes the mandatory bottleneck.

**How to avoid:**
- Implement three-tier fallback: (1) relay server, (2) DDNS (if configured), (3) hardcoded home IP (if user provides it during setup).
- Relay server must have health checks and automatic client-side detection of relay failure.
- Don't assume relay is always reachable; set timeouts (5 seconds) and fall through to DDNS.
- Document: relay is required for first connection from new network; thereafter, DDNS/local IP can work.
- Test: simulate relay server downtime, verify fallback to DDNS works.

**Warning signs:**
- User reports: "Can't connect, relay server is down" (indicates no fallback)
- 100% of users affected simultaneously (not just that user; indicates relay dependency)
- No attempt to use DDNS even if configured
- App logs show "relay unreachable" but no fallback attempt

**Phase to address:**
Phase 1 (Relay Server MVP) must include DDNS fallback logic. Phase 3 (UX Polish) should surface relay health status to user.

---

### Pitfall 5: GUI and CLI Are Out of Sync; One Changes State, Other Doesn't Reflect It

**What goes wrong:**
User switches connection mode via CLI, GUI still shows old mode. Or GUI shows "connected" but CLI reports "disconnected". GUI and daemon don't synchronize state; they have independent views of connection status, leading to user confusion and incorrect troubleshooting.

**Why it happens:**
GUI (Electron/Tauri) and daemon (backend service) maintain separate state. Without a proper IPC (inter-process communication) protocol and subscription model, changes in one don't propagate to the other. Developers often query state once on app launch and don't poll for updates.

**How to avoid:**
- Implement daemon state as single source of truth. All state queries go to daemon, not to local client state.
- Use event-based IPC (not polling): daemon publishes state changes, GUI subscribes. Use named pipes (Windows) or socket files (Linux/macOS).
- For mode switching, implement atomic state transition: CLI sends command to daemon, daemon confirms state change, both GUI and CLI receive confirmation.
- Test: connect via GUI, query status via CLI; switch mode via CLI, verify GUI updates within <1 second.
- Add synchronization test to CI: simulate concurrent GUI + CLI operations, verify no race conditions.

**Warning signs:**
- User reports: "GUI says connected but CLI says disconnected"
- Mode switch takes effect for CLI but GUI still shows old mode
- Restarting app fixes state inconsistency (indicates state not synced)
- GUI shows "connected" but network traffic doesn't route (indicates stale state)

**Phase to address:**
Phase 2 (Client MVP) must implement daemon + IPC architecture with strict state synchronization. Phase 1 (Relay Server) can skip this; it's client-only.

---

### Pitfall 6: WireGuard Keys Are Exposed During Client Onboarding

**What goes wrong:**
Client onboarding flow exchanges WireGuard private keys insecurely. Keys are transmitted via plaintext HTTP, stored unencrypted on disk, or shared via email/messaging. An attacker with network access can intercept the key and impersonate the client.

**Why it happens:**
Developers underestimate key exchange flow. Setting up a new client requires sharing a private key from server to client. Without TLS or pre-shared secrets, this is vulnerable. For personal use, developers think "it's just for home network, doesn't need security," but keys in plaintext are an easy attack vector.

**How to avoid:**
- Key exchange must occur over TLS-encrypted channel (HTTPS, not HTTP).
- Relay server must use HTTPS/TLS for all client-server communication.
- Private keys must never be stored in plaintext on disk. Use OS keychain/credential store (Windows Credential Manager, macOS Keychain, Linux pass).
- For initial setup, use one-time URLs: server generates temporary key-exchange URL, client visits it, downloads encrypted config, stores in keychain.
- Document: "Keys are secrets; treat like passwords."

**Warning signs:**
- Keys stored in plaintext config files in user directory
- Onboarding flow uses HTTP (not HTTPS)
- Keys sent via email or messaging for new clients
- No mention of keychain/secure storage in documentation

**Phase to address:**
Phase 1 (Relay Server MVP) must use HTTPS. Phase 2 (Client MVP) must implement secure key storage and one-time URL onboarding.

---

### Pitfall 7: Connection Timeouts Are Too Long; Users Abandon App

**What goes wrong:**
Client connects and waits 30+ seconds for response. During normal hole punching, this is expected, but if relay is unreachable or network is down, user sees spinner for 30 seconds with no feedback, then a generic "Connection Failed" error. User kills the app, tries again, same result.

**Why it happens:**
Developers set long timeouts to accommodate slow networks or slow hole punching. But without intermediate feedback (e.g., "Attempting direct connection... falling back to relay..."), users think the app is hung.

**How to avoid:**
- Set aggressive timeouts: 3-5 seconds for hole punching, 5 seconds for relay fallback, total max 10-15 seconds before giving up.
- Provide status feedback: show "Attempting peer connection", "Using relay", "Establishing tunnel" as connection progresses.
- Log timeout events for diagnostics: "Hole punch timed out after 3s, trying relay".
- Test on slow/unreliable networks (intentional latency/packet loss) to tune timeouts.

**Warning signs:**
- Users report: "App hangs for 30 seconds"
- Connection succeeds eventually but feels broken
- No progress feedback during connection attempt
- High app crash rates (users force-killing while "connecting")

**Phase to address:**
Phase 2 (Client MVP) must implement aggressive timeouts + progress feedback. Phase 1 (Relay) can skip; it's client-side UX.

---

### Pitfall 8: Relay Server Configuration Empty or Misconfigured; Clients Can't Find It

**What goes wrong:**
Relay server starts but has empty DERP/relay map or no region configured. Clients attempt to connect to relay but receive "no relay available" or "relay unreachable" error. Deployment works in dev, fails in staging/production because configuration wasn't copied or wasn't validated.

**Why it happens:**
Relay server configuration (especially if using Tailscale DERP or similar) requires explicit setup. A misconfigured or missing config file results in silent failures: relay process starts but doesn't load any regions. Developers don't validate config at startup.

**How to avoid:**
- Add config validation at relay startup: verify relay address/port is set, regions are populated, TLS certificate exists and is valid.
- Fail fast with clear error message if config is invalid (don't silently start with no regions).
- Document configuration for both self-hosted relay (what fields are required) and cloud deployment (env vars, config files).
- Test: spin up relay in clean environment, verify `curl https://relay-server/status` returns expected region list.

**Warning signs:**
- Relay process runs but clients get "no relay available"
- Config file missing or empty (no error at startup)
- DERP map is empty in logs
- Clients connect directly (indicating relay not used) when relay should be primary

**Phase to address:**
Phase 1 (Relay Server MVP) must include config validation and clear error messages.

---

### Pitfall 9: Race Condition Between Daemon Startup and CLI Command Execution

**What goes wrong:**
User runs `personal-tunnel connect` immediately after boot. CLI tries to talk to daemon, but daemon hasn't fully initialized yet. Command fails with "daemon not found" or timeout. User retries, it works.

**Why it happens:**
Daemon startup is async. CLI doesn't wait for daemon or retry. If daemon takes a few seconds to initialize, CLI fails immediately. Developers don't add daemon health checks or retry logic in CLI.

**How to avoid:**
- CLI should attempt daemon connection with retries (up to 5 attempts, 1 second apart).
- If daemon is not running, CLI can spawn it or report "Starting daemon, please retry" with clear message.
- Daemon should write PID file or socket file when ready, CLI can poll for this.
- Test: reboot, run CLI immediately, verify it either waits for daemon or retries gracefully.

**Warning signs:**
- First command after boot fails with "daemon not responding"
- User runs command again, it works (race condition, not persistent issue)
- Logs show daemon starting after CLI tries to connect
- No retry logic in CLI error messages

**Phase to address:**
Phase 2 (Client MVP) CLI implementation must include daemon health checks and retries.

---

### Pitfall 10: Split Tunnel Mode (LAN-Only) Leaks Traffic for Non-LAN Domains

**What goes wrong:**
User expects LAN-Only mode to isolate home network access but allow normal internet. Instead, all traffic outside LAN routes correctly, but user's ISP/network sees all browsing from that device as if it's not behind VPN. This is actually correct behavior, but users misunderstand and think it's a security failure.

**Why it happens:**
Naming confusion. "LAN-Only" sounds like it restricts all traffic, but it means "access LAN through tunnel, use normal internet otherwise." Users expect privacy for non-LAN traffic.

**How to avoid:**
- Document clearly in UI: "LAN-Only mode: Home network access via tunnel, all other traffic uses your normal internet connection. Your ISP can see non-LAN browsing."
- Provide mode picker with clear descriptions, not just toggle.
- Consider renaming to "LAN Access" instead of "LAN-Only" to reduce confusion.
- Add info popup when switching to LAN-Only mode explaining what it means.

**Warning signs:**
- User support questions: "Why does my ISP still see my browsing?"
- Users enabling "LAN-Only" expecting privacy (misunderstanding the feature)
- Bug reports about "traffic leaks" that are actually correct behavior

**Phase to address:**
Phase 2 (Client MVP) documentation and UI must clarify modes. Phase 3 (UX Polish) should add onboarding/help tooltips.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip IPv6 support entirely | Faster v1 launch | Users with IPv6 networks leak identity; hard to retrofit later | Only v1 MVP; must remove IPv6 entirely (disable it) to prevent leaks |
| Store keys in plaintext config file | Easier setup, no keychain API | Compromised if device stolen; hard to migrate to keychain later | Never. Even MVP must use OS keychain |
| Relay server as HTTP (not HTTPS) | Faster to deploy (no cert) | Keys transmitted in plaintext; breaks security model | Never. Even test relay must use self-signed cert over HTTPS |
| Skip DNS leak detection | Faster to launch | Users discover leaks in the wild; breaks trust | Only if you document "DNS not configured in this mode" and users accept it |
| Polling for state instead of events | Simpler IPC code | GUI lags behind reality; race conditions with mode switching | Only if polling interval <500ms AND you add disclaimers; not acceptable for production |
| Hardcode relay server address | No config files to manage | Impossible to run relay anywhere except that address; requires code recompile to change | Never in production. Config files mandatory. |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Relay server discovery | Assuming relay URL is always reachable; no fallback to DDNS | Implement three-tier: relay → DDNS → hardcoded IP with timeouts at each stage |
| DDNS provider (if used) | Updating DDNS during connection causes brief disconnection; no retry | Update DDNS asynchronously, ensure active connections stay open; reconnect on DDNS change |
| OS network manager (macOS/Windows/Linux) | Assuming WireGuard always raises to top of routing table; priority conflicts | Use platform-specific APIs to control route priority (e.g., WireGuard metric on Linux, Entitlements on macOS) |
| Desktop notification system | Blocking calls to notify user of state change; UI hangs | Use async notification APIs; don't block on user action |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Relay server accepts all connections without rate limiting | Bandwidth expensive; single relay shared by all users | Implement rate limiting (tokens per client per second); monitor relay bandwidth | >10 concurrent clients or >100 Mbps aggregate traffic |
| Polling daemon state from GUI every 100ms | Works fine on fast machines | Switch to event-based state updates (daemon publishes, GUI subscribes) | >3-4 instances of app/CLI running simultaneously on same machine |
| Storing all connection logs in memory | Works for <100 connections | Rotate logs to disk, implement circular buffer | >50 mode switches or connection attempts logged |
| Relay server single-threaded | Handles home use fine | Use async I/O or thread pool for relay | >5 concurrent client handshakes |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sharing WireGuard private keys via unencrypted channel | Attacker intercepts key, impersonates client | All key exchange over TLS; keys in OS keychain, not plaintext |
| Relay server runs without authentication (any client can connect) | Attacker sets up rogue client, intercepts traffic from other users | Implement mutual TLS or key-based auth for relay; document that relay should not be exposed to internet without auth |
| Hardcoding relay server address in client | Must recompile or patch to change relay; can't switch to backup relay | Config file or env var for relay address; support multiple relays with failover |
| DNS queries not encrypted (using plaintext DNS) | ISP/attacker sees which domains are accessed even through tunnel | Use DoH (DNS over HTTPS) or encrypted DNS for full-gateway mode; document this clearly |
| No validation of home network's TLS cert when client connects over HTTPS (if home server is HTTPS) | MITM attack if ISP or network attacker intercepts connection | Validate certificate or use certificate pinning for known home server certificate |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No clear status indicator of connection state (connected/disconnected/relay/direct) | User doesn't know if they're protected or leaking | Show status badge with color coding and mode indicator (relay vs. direct, LAN-Only vs. Full Gateway) |
| Error messages like "Connection failed" with no reason | User can't troubleshoot; must contact support | Show specific error: "Relay server unreachable, check internet. Falling back to DDNS...", "NAT traversal failed, using relay", etc. |
| Mode switching requires app restart or restart of connection | Users expect instant switch; annoying friction | Implement mode switching without reconnect if possible (or quick 1-2 second reconnect) |
| No onboarding; user must know how to generate keys and exchange them | High barrier to entry; users give up | Provide QR code or one-time URL for key setup; automate as much as possible |
| Generic "connecting..." spinner with no progress | Users think app is hung; force-kill it | Show detailed progress: "Attempting direct connection", "Relay available, connecting", "Tunnel established" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Connection Establishment:** Works in happy path but untested on symmetric NAT, CGNAT, or slow networks — verify fallback to relay works and shows progress
- [ ] **Mode Switching:** GUI shows mode changed but daemon state not updated or CLI hasn't synced yet — verify state synchronization via IPC
- [ ] **DNS Configuration:** Configured in WireGuard but not validated on all platforms (Windows + macOS + Linux) — run DNS leak test on each platform
- [ ] **IPv6:** Disabled in one place but enabled in another; IPv6 route still exists — verify ::/0 routes or explicitly disable IPv6 interface-wide
- [ ] **Key Onboarding:** Works in manual setup but one-time URL / QR code flow never tested with fresh user — end-to-end test with new machine
- [ ] **Relay Fallback:** Code path exists but never triggered in tests — simulate relay downtime, verify fallback works
- [ ] **Logging:** Works for developer but log files not persisted to disk or cleared between sessions — verify logs survive app restart
- [ ] **State Recovery:** App crashes during connection; restarts and remembers last mode — verify daemon persists state to disk and restores it

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| DNS leaks detected in wild | MEDIUM | Document fix, release patch, add DNS leak detection to app, provide clear remediation instructions |
| IPv6 leak on macOS | MEDIUM | Disable IPv6 support in v1, release patch, plan full IPv6 support for v2 |
| Relay server compromised or attacker intercepts keys | HIGH | Rotate all client keys, redeploy relay with TLS, push security update, audit logs |
| Users stuck with stale GUI state, can't recover | LOW | Add "Refresh State" button in UI, improve daemon IPC robustness, release patch for state sync |
| Symmetric NAT users can't connect, no relay fallback | HIGH | Implement relay fallback, release update, requires user reconnection to work |
| CLI daemon startup race condition causes widespread failures | LOW | Add retry logic, release patch, users retry command once and it works |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Symmetric NAT / Relay failure | Phase 1 (Relay MVP) + Phase 2 (Client) | Test hole punch timeout triggers relay fallback; measure success rate on symmetric NAT network |
| DNS leaks | Phase 2 (Client MVP) | Run DNS leak test in both modes; verify home DNS resolves home domains, ISP DNS for external |
| IPv6 leaks | Phase 2 (Client MVP) | Disable IPv6 entirely in v1; verify no IPv6 routes exist; test on dual-stack network |
| Relay single point of failure | Phase 1 (Relay MVP) | Implement DDNS fallback logic; test relay downtime scenario |
| GUI/CLI state desync | Phase 2 (Client MVP) | Implement daemon IPC with event subscriptions; automated test of concurrent GUI + CLI operations |
| Key exposure | Phase 1 (Relay MVP) + Phase 2 (Client) | Relay uses TLS; client stores keys in OS keychain; key exchange over HTTPS; no keys in plaintext configs |
| Connection timeouts too long | Phase 2 (Client MVP) | Set timeouts <15s total; add progress feedback in UI; test on slow networks |
| Relay config validation | Phase 1 (Relay MVP) | Relay startup validates config; fails with clear error if regions empty; document required config |
| Daemon startup race | Phase 2 (Client MVP) CLI | CLI retries daemon connection; daemon writes PID file when ready |
| Split tunnel naming confusion | Phase 3 (UX Polish) | Clear mode names and descriptions in UI; onboarding explains what each mode does |

---

## Sources

- [Tailscale: How NAT traversal works](https://tailscale.com/blog/how-nat-traversal-works)
- [Tailscale: NAT traversal improvements, part 1](https://tailscale.com/blog/nat-traversal-improvements-pt-1)
- [Tailscale: NAT traversal improvements, part 3](https://tailscale.com/blog/nat-traversal-improvements-pt3-looking-ahead)
- [WireGuard split tunneling guide](https://cr0x.net/en/wireguard-split-tunneling-guide/)
- [WireGuard DNS leaks on Windows](https://engineerworkshop.com/blog/dont-let-wireguard-dns-leaks-on-windows-compromise-your-security-learn-how-to-fix-it/)
- [Hardening WireGuard security](https://contabo.com/blog/hardening-your-wireguard-security-a-comprehensive-guide/)
- [WireGuard protocol security analysis](https://www.wireguard.com/papers/)
- [Symmetric NAT and UDP hole punching](https://dev.to/dev-dhanushkumar/nat-traversal-a-visual-guide-to-udp-hole-punching-1936)
- [STUN/TURN for WebRTC NAT traversal](https://webrtc.link/en/articles/stun-turn-servers-webrtc-nat-traversal/)
- [VPN connection state management issues (2025)](https://learn.microsoft.com/en-us/answers/questions/2197583/vpn-experiencing-issues-lately-(dec-2024-jan-2025))
- [Mullvad VPN daemon architecture](https://deepwiki.com/mullvad/mullvadvpn-app/2.1-daemon)
- [OpenTabletDriver daemon-client communication patterns](https://deepwiki.com/OpenTabletDriver/OpenTabletDriver/2.1-user-interface-and-daemon-communication)
- [Distributed systems race conditions and synchronization](https://medium.com/@alexglushenkov/the-art-of-staying-in-sync-how-distributed-systems-avoid-race-conditions-f59b58817e02)

---

*Pitfalls research for: Personal VPN/Tunnel (WireGuard-based, relay-assisted, desktop GUI)*
*Researched: 2026-03-11*
