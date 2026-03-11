# HomeLAN

## What This Is

A personal VPN/tunnel tool built on WireGuard that lets you connect to your home network from anywhere as if you're on its LAN. It has a desktop GUI (Electron/Tauri) and CLI, supports two connection modes, and uses a lightweight relay server for discovery. Claude Code can invoke it as a skill to access host network resources programmatically.

## Core Value

Seamlessly access home LAN resources (SMB shares, local services, devices) from anywhere, with a single click or CLI command, in the right mode for the situation.

## Requirements

### Validated

- ✓ Lightweight relay/rendezvous server for NAT traversal and peer discovery (deployable on Vercel, AWS, any VPS, or free tier) — Phase 1
- ✓ Server component that runs flexibly (Windows, Linux VM, dedicated device) — Phase 1
- ✓ WireGuard key-based authentication (no user accounts needed) — Phase 1
- ✓ Connection status display (connected/disconnected, current mode, latency, throughput) — Phase 1 (IPC contract defined + daemon status endpoint)

### Active

- [ ] Two connection modes: Full Gateway (LAN + internet via home) and LAN-Only (LAN access + client's own internet)
- [ ] WireGuard-based tunnel between client and server
- [ ] Cross-platform desktop GUI (Electron/Tauri) for Windows and macOS
- [ ] CLI for programmatic/headless use (connect, disconnect, switch modes, status)
- [ ] Claude Code skill definition for the CLI commands
- [ ] Client onboarding: key generation and exchange via relay
- [ ] Dynamic DNS support as secondary discovery method
- [ ] Mode switching: ability to change between Full Gateway and LAN-Only without reconnecting (if possible) or with quick reconnect

### Out of Scope

- Mobile clients (Android, iOS, tvOS, Fire TV) — deferred to v2, focus on Windows + macOS first
- User account management / login credentials — WireGuard keys are sufficient for v1
- Multi-site / mesh networking — single home network for v1
- Commercial relay service — self-hosted relay only

## Context

- Raphael's home network: Windows desktop (192.168.7.101), Mac Mini M4 (192.168.7.102), Linux VM (172.24.174.17), Fire TV (192.168.7.152)
- Primary use case: accessing home LAN resources (SMB shares at `\\192.168.7.102\*`, local services, SSH to VM) from outside
- Claude Code integration: AI agent needs to connect to host network to access resources like local APIs, file shares, and SSH — initiated via skill/CLI
- Relay server does handshake/hole-punching only; actual tunnel traffic is peer-to-peer via WireGuard
- Server should be able to run on any of the home machines (flexible deployment)

## Constraints

- **Tunnel tech**: WireGuard — chosen for speed, simplicity, and broad OS support
- **GUI framework**: Electron or Tauri — cross-platform with single codebase
- **v1 platforms**: Windows and macOS desktop clients only
- **Relay**: Must be deployable on free-tier cloud services (minimal resource needs)
- **Auth**: WireGuard key pairs only — no additional auth layer for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WireGuard over OpenVPN | Faster, simpler, modern, kernel-level performance | Confirmed (Phase 1) |
| Relay-first discovery | Avoids port-forwarding headaches; DDNS as fallback | Confirmed (Phase 1) |
| Tauri for GUI | Smaller bundle, lower memory, future mobile support | Confirmed |
| WireGuard keys only for auth | Simplicity; key exchange via relay handles onboarding | Confirmed (Phase 1) |
| Focus relay mode first, DDNS second | Relay works without router config; lower barrier | Confirmed (Phase 1) |
| Node.js crypto for WireGuard keygen | No binary deps; X25519 built into Node.js | Phase 1 |
| Private key never in IPC responses | Enforced at type level (WireguardKeypair has no privateKey) | Phase 1 |

---
*Last updated: 2026-03-11 after Phase 1*
