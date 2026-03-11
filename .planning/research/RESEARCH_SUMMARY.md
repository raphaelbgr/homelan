# Research Summary: HomeLAN (Personal VPN/Tunnel)

**Domain:** Personal VPN/Tunnel for remote LAN access
**Researched:** 2026-03-11
**Research Scope:** Features dimension (table stakes vs differentiators vs anti-features)
**Overall Confidence:** HIGH

## Executive Summary

The personal VPN/tunnel market is dominated by three players: Tailscale (managed SaaS), ZeroTier (managed SaaS), and Nebula (self-hosted). Each targets different user segments, but all share core features: peer-to-peer tunneling, NAT traversal, DNS management, and multi-platform clients.

HomeLAN's competitive advantage lies not in copying these features, but in **optimizing for a narrower use case**: personal LAN access from remote locations with **zero lock-in** and **two distinct connection modes as a first-class feature**. Unlike competitors who offer routing rules and filtering (complex for non-technical users), HomeLAN makes mode switching simple and explicit: **Full Gateway** (route all traffic through home) or **LAN-Only** (access LAN, use own internet).

The research confirms that **table stakes are achievable and well-understood** (WireGuard + relay + basic discovery). The differentiation opportunity is in **UX simplicity, self-hosted relay, and mode switching as core** — not in trying to outfeature competitors.

**Launch strategy:** Build a complete, minimal product for desktop (Windows/macOS) with both modes, CLI for automation, and a relay you control. Validate that users value this combination. Mobile and multi-home can follow once product-market fit is proven.

## Key Findings

### Table Stakes (Must-Have for Launch)

1. **Peer-to-peer tunnel** — WireGuard is the standard; users expect it.
2. **Automatic NAT traversal** — No port-forwarding should ever be required; relay + hole-punching are table stakes.
3. **Connect/Disconnect UI** — Both GUI and CLI; single-click connect is non-negotiable.
4. **Mode switching** — Full gateway ↔ LAN-only toggle; users need both and expect seamless switching.
5. **Connection status display** — Users need to know: connected? which mode? latency?
6. **Service discovery (naming)** — Users shouldn't memorize IPs; simple device naming is expected.
7. **Key-based authentication** — No accounts needed; WireGuard keys are sufficient for v1.
8. **Cross-platform GUI** — Windows + macOS support (mobile deferred).
9. **CLI for automation** — Required for Claude Code and scripting.
10. **Self-hosted relay** — Must be deployable on free-tier cloud; no SaaS dependency.

All 10 are in the PROJECT.md requirements. Research validates each is achievable and necessary.

### Differentiators (Competitive Advantage)

1. **Mode switching without complex routing rules** — Tailscale/ZeroTier make this an advanced ACL feature. HomeLAN makes it **a simple toggle that non-technical users understand**.
2. **Zero vendor lock-in** — Competitors' relays are managed SaaS. HomeLAN's relay is self-hosted code you deploy on your own infrastructure (Vercel, AWS Lambda, any VPS).
3. **WireGuard-only (no multi-layer SDN)** — ZeroTier layers its own protocol on top. HomeLAN uses WireGuard directly, simpler codebase, faster implementation.
4. **Desktop-optimized** — Competitors stretch across 6+ platforms. HomeLAN v1 focuses on Windows/macOS, making each experience excellent.
5. **Claude Code integration** — Unique to HomeLAN; AI agents can invoke tunnel CLI to access home resources programmatically.

**These differentiators are orthogonal to competitors' strengths** — they're not trying to beat Tailscale at scale or ZeroTier at layer-2 networking. HomeLAN wins on simplicity and control for a specific user (Raphael) and use case (home LAN access).

### Anti-Features (What NOT to Build)

Research surfaced several "nice-to-have" features that introduce more complexity than value:

1. **User accounts / login** — Surface appeal: "More secure." Reality: WireGuard keys already authenticate peers; passwords add friction and support burden.
2. **Graphical key management** — Surface appeal: "Easier than CLI." Reality: Hides security details; users skip understanding their keys; complicates key rotation.
3. **Encrypted cloud profile sync** — Surface appeal: "Backup my config." Reality: Adds central dependency; users can manually backup files or re-run setup.
4. **Mobile clients in v1** — Surface appeal: "Feature parity." Reality: Large scope creep; iOS/Android are separate native projects; desktop isn't even stable yet.
5. **Multi-home network support** — Surface appeal: "Connect to office AND home." Reality: Requires mesh coordination and routing conflicts; defer to v2.

These are documented in FEATURES.md with explicit reasons to avoid them.

## Implications for Roadmap

### Recommended Phase Structure

**Phase 1: Core Tunnel (Weeks 1-3)**
- [ ] WireGuard server component (runs on home machine; any OS)
- [ ] Lightweight relay server (NAT traversal, peer discovery)
- [ ] Basic key exchange and onboarding
- **Why first:** Everything depends on this. No GUI features until tunnel works.
- **Avoid:** Advanced routing, user accounts, multi-home logic.

**Phase 2: Desktop GUI + CLI (Weeks 4-6)**
- [ ] Electron/Tauri GUI for Windows + macOS
- [ ] CLI with connect/disconnect/status/switch-mode commands
- [ ] Connection status display (mode, latency, throughput)
- **Why now:** Users can't use GUI until tunnel is stable. CLI enables automation immediately.
- **Avoid:** Configuration file editing UI, advanced metrics, device naming complexity.

**Phase 3: Mode Switching (Weeks 7-8)**
- [ ] Full Gateway mode implementation
- [ ] LAN-Only mode implementation
- [ ] Mode toggle UI (GUI button + CLI flag)
- [ ] Seamless or quick-reconnect switching
- **Why separate phase:** Requires stable tunnel + GUI first. Core differentiator so it deserves focus.
- **Avoid:** Complex routing rules, per-app mode selection.

**Phase 4: Service Discovery + Device Naming (Weeks 9-10)**
- [ ] Auto-discover LAN devices available through tunnel
- [ ] Simple device naming (hostname-based)
- [ ] DNS resolution of device names
- **Why here:** Enhances usability once tunnel is proven. Depends on stable mode switching.
- **Avoid:** MagicDNS complexity in v1; implement simple hostname resolver.

**Phase 5: Claude Code Integration + CLI Polish (Weeks 11-12)**
- [ ] Document CLI as official Claude Code skill
- [ ] Refine CLI error messages and outputs
- [ ] Connection history / logging (local only)
- **Why last:** GUI and CLI must be stable before publishing as skill.
- **Avoid:** Expanding CLI scope; keep it focused on core operations.

**Phase 6: Validation + Iteration (Ongoing)**
- [ ] Deploy to Raphael's home network
- [ ] Use tunnel for real Claude Code agent workflows
- [ ] Gather feedback on UX, mode switching, relay reliability
- [ ] Decide on next priorities based on actual usage

### Phase Ordering Rationale

1. **Core tunnel first** → Everything depends on it; no shortcuts.
2. **GUI + CLI second** → Users and agents can't use tunnel without interfaces.
3. **Mode switching third** → Core differentiator; implement after core UX is proven.
4. **Service discovery fourth** → Enhancement; depends on stable tunnel + modes.
5. **Integration fifth** → Only publish as Claude Code skill once core is production-ready.
6. **Validation last** → Deploy to real environment; let actual usage drive priorities.

This ordering respects dependencies: you can't switch modes until tunnel works, can't use naming until modes work, can't publish as skill until everything is stable.

### Research Flags for Phases

| Phase | Topic | Risk | Mitigation |
|-------|-------|------|-----------|
| Phase 1 | WireGuard key rotation on server restarts | MEDIUM | Test frequent restart scenarios; document key persistence. |
| Phase 1 | Relay server NAT traversal edge cases | MEDIUM | Test with various NAT types (CGNAT, strict, symmetric); use STUN to verify. |
| Phase 3 | Mode switching without tunnel restart | HIGH | Prototype quick-reconnect pattern; may require WireGuard config reload optimization. |
| Phase 4 | DNS name resolution on closed LANs | MEDIUM | Test with non-broadcast LANs; may need manual device registry. |
| Phase 4 | Cross-platform hostname consistency | LOW | Hostnames work on macOS/Linux; test Windows hostname edge cases. |
| Phase 5 | CLI as documented skill | LOW | Claude Code skill format is standard; low technical risk. |

**Critical:** Phase 3 (mode switching) is the highest technical risk. Prototype early if possible; don't defer to end of phase 2.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Table Stakes** | HIGH | WireGuard, NAT traversal, relay servers are well-documented patterns. No surprises here. |
| **Differentiators** | HIGH | Mode switching + zero lock-in are orthogonal to competitors; research confirms both are achievable and valuable. |
| **Anti-Features** | HIGH | Feedback across Tailscale/ZeroTier communities validates why these add complexity without proportional value. |
| **Architecture** | MEDIUM | Relay server architecture is clear; mode switching implementation needs prototyping. Consider a spike in Phase 1. |
| **Feasibility** | HIGH | All table stakes are implemented by competitors; HomeLAN reuses proven patterns with different UX. |

**Overall: HIGH confidence** in what to build. MEDIUM confidence in how to implement mode switching perfectly (technical spike recommended).

## Gaps Addressed by Phase-Specific Research

- **Phase 1 (Relay):** Need deep dive on STUN protocols, hole-punching edge cases, fallback behavior.
- **Phase 3 (Mode Switching):** Need prototype/proof-of-concept; WireGuard config reload vs TCP fallback vs full reconnect tradeoffs.
- **Phase 4 (Service Discovery):** Need DNS resolution strategy for closed networks; compare simple hostname resolver vs MagicDNS complexity.

These are not blockers for starting Phase 1, but should be researched as each phase approaches.

## Competitive Positioning

| Competitor | Focus | Lock-In | Our Strategy |
|------------|-------|---------|--------------|
| **Tailscale** | Managed SaaS, enterprise features (SSO, ACLs), largest ecosystem | Managed relay (SaaS) | Avoid lock-in; self-host relay. Skip enterprise features. |
| **ZeroTier** | Layer-2 networking, multi-cloud, large-scale deployments | Managed controller | Simpler WireGuard; avoid multi-layer SDN. |
| **Nebula** | Open source, self-hosted, certificate-based auth | None (fully open) | Nebula is threat only if we don't ship; we ship faster by choosing simpler auth (keys, not certs). |

**HomeLAN wins on:** Control (self-hosted relay), simplicity (WireGuard + mode toggle), and integration (Claude Code). **HomeLAN loses on:** Scale (only 1 home network), platform breadth (desktop only), and managed features (no SSO/ACLs).

This is fine. The product is optimized for Raphael's use case, not the entire market.

## Validation Plan

Once MVP is live:

1. **Can users connect and disconnect reliably?** — Track connection uptime, error messages.
2. **Do users actually switch modes?** — Log mode toggle frequency; if 0%, mode switching isn't valuable.
3. **Does relay serve its purpose?** — Monitor relay latency, fallback frequency; if relay is down often, add DDNS fallback.
4. **Do Claude Code agents work?** — Test agent workflows accessing SMB shares, SSH to VM, local APIs.
5. **What breaks?** — Collect error reports; prioritize fixes based on frequency.

After validation (4 weeks live):
- If everything works, phase 4 (service discovery) is clear next step.
- If mode switching feels clunky, prototype better UX before Phase 4.
- If relay is unreliable, add DDNS fallback before publicizing as skill.

## Conclusion

Research confirms HomeLAN is a viable product with a clear competitive differentiation: **simple mode switching + zero vendor lock-in for personal LAN access**. The feature landscape is well-understood; all table stakes are achievable with proven patterns (WireGuard, relay servers, basic DNS). The roadmap should be:

1. **Ship the core tunnel** (relay + WireGuard).
2. **Build simple GUI + CLI interfaces** (not fancy, just functional).
3. **Implement mode switching as a core feature** (the differentiator).
4. **Add naming/discovery once core works** (enhancement, not blocker).
5. **Integrate with Claude Code** (unique value).
6. **Validate with real usage** (then decide what to build next).

No feature research is blocking the start of Phase 1. The roadmap can begin immediately.

---

**Researched by:** Claude Code (gsd:research phase)
**Date:** 2026-03-11
**Project:** HomeLAN
