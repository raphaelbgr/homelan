# Feature Research

**Domain:** Personal VPN/Tunnel for LAN access from remote locations
**Researched:** 2026-03-11
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Connect/Disconnect | Basic VPN functionality; users expect on/off control | LOW | CLI and GUI both required for v1 |
| Cross-platform clients | Windows + macOS support for desktop users | MEDIUM | Electron/Tauri single codebase; mobile deferred to v2 |
| Stable peer-to-peer tunnel | Core VPN delivery; WireGuard proven across platforms | MEDIUM | WireGuard already solves this; focus on CLI/GUI layer |
| Connection status display | Users need to know if connected/disconnected and tunnel health | LOW | Show current mode, latency, data throughput |
| NAT traversal (automatic) | Users behind home routers expect it to "just work" without port-forwarding | MEDIUM | Relay server + hole-punching handles this; users should not see NAT complexity |
| Keyless authentication | Users expect simple onboarding; no account creation friction | LOW | WireGuard key-based auth; key exchange via relay during setup |
| Quick connection | Sub-second connect time to existing tunnel (after initial setup) | MEDIUM | WireGuard is fast; CLI command should be instant |
| Mode switching | Users need to toggle between Full Gateway and LAN-Only without app restart | MEDIUM | Should be seamless or quick reconnect; core value prop |
| Service discovery (basic) | Users want human-readable names for LAN devices, not IP addresses | MEDIUM | Simple device listing + DNS naming; MagicDNS approach optional |
| CLI for automation | Claude Code and scripts need programmatic access | LOW | Basic connect/disconnect/status/switch-mode commands |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Mode switching without reconnect** | Stay connected while seamlessly changing how traffic is routed (LAN-only ↔ full gateway) | HIGH | WireGuard doesn't natively support this; may require custom logic or quick disconnect/reconnect with state preservation |
| **Lightweight self-hosted relay** | Deploy on free-tier cloud (Vercel, AWS free tier) or any VPS; no external SaaS dependency | MEDIUM | Design relay as stateless signaling service; fits Vercel Functions or Lambda |
| **Dynamic DNS fallback** | If relay is down, tunnel still works via DDNS discovery (if home has stable DDNS) | MEDIUM | Secondary discovery method; reduces single point of failure |
| **GUI with mode indicator** | Visual indication of which mode active + latency/throughput metrics | LOW | Simple tray icon or app showing current state |
| **Claude Code skill integration** | AI agents can invoke tunnel CLI to access home resources programmatically | LOW | Publish CLI as documented skill; feeds into broader agent ecosystem |
| **Multi-device peer coordination** | Auto-add new home devices to tunnel without manual key exchange | HIGH | Requires control plane logic; home server acts as coordinator for peer discovery |
| **Bandwidth-aware mode selection** | Suggest LAN-only mode if WAN bandwidth is saturated | MEDIUM | Monitor throughput; provide UI hint to user |
| **Connection history** | Log recent connects/disconnects with timestamps (local only, no central collection) | LOW | Useful for debugging; shows user when tunnel was active |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **User accounts + login** | Surface appeal: "Secure with credentials"; multi-user features | Scope creep; WireGuard keys are sufficient; adds password reset burden; complicates onboarding; contradicts "no accounts" philosophy | WireGuard key pairs already authenticate peers; if multi-user needed in future, use key rotation, not accounts |
| **Graphical key management UI** | "More user-friendly than CLI"; visual cert display | Hides important security details; users skip understanding their keys; leads to poor key rotation habits; overengineering for v1 | Simple text-based key display during setup; document key files; users learn mechanics |
| **Encrypted profile sync** | "Backup my tunnel config"; cloud-backed settings | Introduces central dependency; adds auth/encryption complexity; users can manually backup .conf files or re-run setup; encourages trusting sync service | Local .conf file in user home; user controls backup; setup script for new machines |
| **Mobile client** | "Access from my phone"; feature parity across platforms | Large scope creep; iOS/Android require separate native development; mobile VPN on iOS has permission constraints; fire off-roadmap for now | Ship desktop first; validate demand; mobile deferred to v2 when desktop is stable |
| **Multi-home networks** | "Connect to office LAN + home LAN simultaneously" | Scope explosion; requires mesh coordination, routing logic, conflict resolution; breaks "single home network" MVP | Focus v1 on one home; if multi-site needed, user spins up separate tunnel instances |
| **Real-time activity log** | "See all data passing through tunnel"; appeal: transparency | Performance impact; logging all packets is I/O heavy; privacy concern if logging stored centrally; creates unneeded compliance burden | Optional local packet capture for debugging only; not default behavior |
| **Automatic tunnel reconnect on network change** | "Seamlessly handle Wi-Fi ↔ cellular"; seems like UX win | Adds state machine complexity; can mask underlying issues (like DDNS not updating); users may expect to be "always connected" which isn't real; simpler to let user click connect | User controls connect/disconnect; show clear connection status; fail loudly on network change |
| **Centralized key server** | "Securely distribute keys to new peers"; managed service appeal | Single point of failure; requires infrastructure trust; contradicts "self-hosted" philosophy; adds attack surface | Relay server only does STUN/hole-punch signaling; keys are user-managed or exchanged out-of-band |

## Feature Dependencies

```
[Connect/Disconnect] ──requires──> [NAT Traversal]
    ├──requires──> [Stable P2P Tunnel]
    └──requires──> [Key Authentication]

[Mode Switching (Full Gateway ↔ LAN-Only)]
    ├──requires──> [Connect/Disconnect]
    └──requires──> [Connection Status]

[Service Discovery]
    └──enhances──> [Connection Status]

[CLI for Automation]
    ├──requires──> [Connect/Disconnect]
    ├──requires──> [Mode Switching]
    └──enhances──> [Claude Code Integration]

[GUI (Desktop)]
    ├──requires──> [Connect/Disconnect]
    ├──requires──> [Mode Switching]
    └──enhances──> [Connection Status Display]

[Dynamic DNS Fallback]
    └──conflicts──> [Relay-Only Discovery] (but provides fallback, not conflict)
    └──enhances──> [NAT Traversal]

[Multi-Device Peer Coordination]
    ├──requires──> [Key Authentication]
    └──requires──> [Service Discovery]
```

### Dependency Notes

- **Connect/Disconnect requires NAT Traversal:** Without automatic hole-punching/relay, users must manually port-forward to their home router — defeats ease-of-use value prop.
- **Mode Switching requires Connect/Disconnect:** Mode switching implementation likely uses disconnect→reconnect pattern or WireGuard config reload; both need stable connection primitive.
- **Service Discovery enhances Connection Status:** Device names make status display human-readable (show "Mac Mini connected" not "10.0.0.2 connected").
- **CLI for Automation requires all core features:** CLI must expose connect/disconnect/status/mode-switch to be useful for scripts and Claude Code.
- **Dynamic DNS Fallback doesn't conflict with relay:** Both can coexist. Relay is primary; DDNS is secondary fallback if relay unavailable.
- **Multi-Device Peer Coordination requires Service Discovery:** Can't coordinate device membership without naming/discovery mechanism.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [x] **Connect/Disconnect** — Core tunnel functionality; without this, nothing works.
- [x] **WireGuard-based P2P tunnel** — Proven, fast, widely supported protocol.
- [x] **NAT Traversal (relay-based)** — Critical for "just works" experience; removes port-forwarding burden.
- [x] **Mode Switching (Full Gateway ↔ LAN-Only)** — Core value proposition; users need both modes.
- [x] **Key-based authentication** — Simpler than accounts; sufficient for v1 personal use.
- [x] **Desktop GUI (Windows + macOS)** — Single click connect; not CLI-only.
- [x] **CLI** — Required for automation and Claude Code integration.
- [x] **Connection status display** — Current mode, latency, basic metrics.
- [x] **Basic service discovery** — Device naming so users don't memorize IPs.
- [x] **Lightweight self-hosted relay** — Deploy on Vercel/AWS free tier; no external SaaS.

**Rationale:** These 10 features create a complete, minimal product that validates whether users value a personal LAN tunnel. Missing any one breaks core functionality or dramatically reduces usability.

### Add After Validation (v1.x)

Features to add once core is working and users are happy.

- [ ] **Dynamic DNS fallback** — Once relay works reliably, add DDNS as secondary discovery.
- [ ] **Claude Code skill documentation** — Once CLI is stable, publish as official skill.
- [ ] **Connection history/logging** — After user feedback on what's useful to track.
- [ ] **Bandwidth monitoring dashboard** — Suggest mode switching based on throughput.
- [ ] **Multi-device peer auto-discovery** — Once single-device tunnel is stable.
- [ ] **Advanced routing rules** — Per-app or per-IP tunnel mode selection.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Mobile clients (iOS/Android)** — Separate native development; wait for desktop to stabilize.
- [ ] **Multi-home network support** — Requires mesh coordination; defer until single-home is mature.
- [ ] **User account / SSO** — Only if organizational/team use case emerges.
- [ ] **Centralized key server** — Only if key distribution becomes painful; today out-of-band is fine.
- [ ] **Real-time packet logging** — Only if users request; adds complexity with marginal value.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Connect/Disconnect | HIGH | MEDIUM | P1 | Core functionality |
| WireGuard P2P Tunnel | HIGH | MEDIUM | P1 | Already chosen; focus on integration |
| NAT Traversal | HIGH | HIGH | P1 | Without this, relay is pointless |
| Mode Switching | HIGH | HIGH | P1 | Core differentiator vs traditional VPNs |
| Key Authentication | HIGH | LOW | P1 | WireGuard native; simple integration |
| Desktop GUI (Windows + macOS) | HIGH | MEDIUM | P1 | Single-click connect required for non-technical users |
| CLI | HIGH | LOW | P1 | Required for automation and agents |
| Connection Status | MEDIUM | LOW | P1 | Users need to know tunnel state |
| Service Discovery (basic) | MEDIUM | MEDIUM | P1 | Device naming for LAN access |
| Lightweight Relay | HIGH | MEDIUM | P1 | No external SaaS dependency |
| Dynamic DNS Fallback | MEDIUM | LOW | P2 | Secondary discovery; enhance after v1 |
| Connection History | LOW | LOW | P2 | Nice-to-have debugging tool |
| Bandwidth Monitoring | LOW | MEDIUM | P2 | Mode selection hints; defer |
| Multi-Device Coordination | MEDIUM | HIGH | P2 | Enhances LAN experience; not v1 blocker |
| Mobile Clients | MEDIUM | HIGH | P3 | Deferred to v2; separate architecture |
| User Accounts | LOW | MEDIUM | P3 | Anti-feature for v1; keys are sufficient |
| Multi-Home Networks | LOW | HIGH | P3 | Out of scope; single home focus |

**Priority key:**
- **P1:** Must have for launch (v1 feature set)
- **P2:** Should have after validation (v1.x additions)
- **P3:** Future consideration (v2+)

## Competitor Feature Analysis

| Feature | Tailscale | ZeroTier | Nebula | HomeLAN (Our Approach) |
|---------|-----------|----------|--------|------------------------|
| **Protocol** | WireGuard | Custom SDN layer 2/3 | Noise Protocol + custom | WireGuard (chosen for simplicity) |
| **Mode Switching** | Not a first-class feature; routing rules approximate split tunneling | Layer-3 splitting available via rules | Not emphasized | First-class feature; full gateway ↔ LAN-only toggle |
| **Relay/Discovery** | Managed cloud relay (lock-in) | Managed moon servers (lock-in) | Self-hosted lighthouses | Self-hosted relay on free-tier cloud (no lock-in) |
| **DNS Management** | MagicDNS (auto naming) | Custom DNS | Manual DNS entries | Basic naming; MagicDNS optional future enhancement |
| **Key Management** | Managed (users authenticate via browser) | Manual key distribution | Manual certificate distribution | WireGuard keys + CLI setup (simple but not auto) |
| **Authentication** | SSO/OIDC (enterprise) | User/password or API keys | Certificates (more complex) | WireGuard keys only (v1 simplicity) |
| **Platform Support** | Windows, macOS, Linux, iOS, Android, tvOS | Windows, macOS, Linux, iOS, Android | Go-based (wide support) | Windows, macOS only (v1); iOS/Android deferred |
| **Self-Hosting Option** | Headscale (community control plane) | Self-hosted central controller | Native self-hosted | Built self-hosted from start |
| **Multi-Network Support** | Yes (multiple tailnets) | Yes (multiple networks) | Yes (multiple networks) | Single network (v1); defer multi-site |
| **Pricing Model** | Freemium SaaS; paid tiers for teams | Freemium SaaS; paid tiers | Open source (free) | Free (self-hosted; no SaaS tier planned) |
| **GUI Quality** | Excellent native clients | Good native clients | Mobile only; Linux/Windows basic | Simple cross-platform (Electron/Tauri) |
| **CLI** | Yes, feature-rich | Yes | Yes | Yes, focused on automation |

## Why HomeLAN Differentiates

1. **Mode Switching as a native feature:** Competitors offer this as an advanced routing rule (obscure); HomeLAN makes it a first-class toggle. Users don't think in routing terms; they think "use home network only" vs "use home as gateway."

2. **No platform lock-in:** Tailscale and ZeroTier require managed relays (dependency on their SaaS). HomeLAN's relay is self-hosted on free-tier cloud (Vercel, AWS Lambda) or any VPS. User controls it; can switch providers; no vendor lock-in.

3. **Simplicity-first auth:** Competitors add SSO, user accounts, ACLs. HomeLAN v1 uses WireGuard keys only. Simpler, fewer moving parts. If users demand multi-user later, keys can evolve; no need today.

4. **Desktop-first (not mobile-first):** Personal LAN tunnels are primarily used from laptops/desktops. Mobile deferred to v2. Competitors stretch across all platforms; HomeLAN optimizes depth over breadth.

5. **Claude Code skill integration:** Unique value for AI agent workflows; agents can invoke CLI to access home resources without separate VPN client.

## Sources

### Ecosystem Overview
- [Tailscale Features & Docs](https://tailscale.com/features)
- [Tailscale DNS Management & MagicDNS](https://tailscale.com/blog/magicdns-why-name)
- [ZeroTier Mesh Networking](https://www.zerotier.com/)
- [Nebula Open Source VPN](https://nebula.defined.net/docs/)

### WireGuard & Tunneling
- [WireGuard Installation & Clients](https://www.wireguard.com/install/)
- [WireGuard Endpoint Discovery & NAT Traversal](https://www.jordanwhited.com/posts/wireguard-endpoint-discovery-nat-traversal/)
- [Unofficial WireGuard Documentation](https://github.com/pirate/wireguard-docs)

### VPN Features & User Expectations
- [VPN Split Tunneling vs Full Tunnel](https://nordvpn.com/features/split-tunneling/)
- [Home VPN vs Business VPN](https://www.expressvpn.com/what-is-vpn/home-vpn-vs-business-vpn)
- [Essential VPN Features 2026](https://www.allthingssecured.com/vpn/11-essential-vpn-features/)
- [Home Server VPN Setup Guide 2026](https://www.homedock.cloud/blog/self-hosting/how-to-set-up-a-home-server-vpn-2026/)

### Competitive Analysis
- [Tailscale vs ZeroTier Comparison](https://tailscale.com/compare/zerotier)
- [Tailscale vs Nebula Comparison](https://tailscale.com/compare/nebula)
- [Top Open Source Tailscale Alternatives 2026](https://pinggy.io/blog/top_open_source_tailscale_alternatives/)

---

**Feature research for:** Personal VPN/Tunnel (HomeLAN)
**Researched:** 2026-03-11
