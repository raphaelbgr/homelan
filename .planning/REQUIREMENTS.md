# Requirements: HomeLAN

**Defined:** 2026-03-11
**Core Value:** Seamlessly access home LAN resources from anywhere, with a single click or CLI command, in the right mode for the situation.

## v1 Requirements

### Tunnel Core

- [ ] **TUNL-01**: Client establishes encrypted WireGuard P2P tunnel to home server
- [ ] **TUNL-02**: User can connect to home network from CLI (`homelan connect`)
- [ ] **TUNL-03**: User can disconnect from home network from CLI (`homelan disconnect`)
- [ ] **TUNL-04**: User can connect/disconnect from desktop GUI with one click
- [ ] **TUNL-05**: Full Gateway mode routes all traffic (LAN + internet) through home network
- [ ] **TUNL-06**: LAN-Only mode routes only home subnet traffic through tunnel, client keeps own internet
- [ ] **TUNL-07**: User can switch between Full Gateway and LAN-Only modes without full reconnect
- [ ] **TUNL-08**: DNS queries are routed correctly per mode (home DNS in Full Gateway, local DNS in LAN-Only)
- [ ] **TUNL-09**: IPv6 is disabled in tunnel to prevent IP leaks (v1)

### NAT Traversal & Discovery

- [ ] **NAT-01**: Client automatically discovers home server via relay without manual port forwarding
- [ ] **NAT-02**: UDP hole punching attempts direct P2P connection first (3-5s timeout)
- [ ] **NAT-03**: If hole punching fails, traffic falls back through relay
- [ ] **NAT-04**: Three-tier fallback: relay → DDNS → hardcoded IP
- [ ] **NAT-05**: Connection attempt shows real-time progress (trying direct → trying relay → trying DDNS)

### Relay Server

- [ ] **RELY-01**: Self-hosted relay server with `/register` and `/lookup` HTTPS endpoints
- [ ] **RELY-02**: Relay server deployable on Vercel, AWS Lambda, any VPS, or free-tier cloud
- [ ] **RELY-03**: Relay validates config at startup and fails fast with clear errors
- [ ] **RELY-04**: Relay communicates over HTTPS only (no plaintext)

### Client Daemon

- [ ] **DAEM-01**: Background daemon manages WireGuard interface lifecycle
- [ ] **DAEM-02**: Daemon generates and stores WireGuard keys in OS keychain
- [ ] **DAEM-03**: Daemon exposes HTTP IPC on localhost for GUI/CLI communication
- [ ] **DAEM-04**: Daemon is single source of truth for all connection state
- [ ] **DAEM-05**: Daemon publishes state changes via events (GUI/CLI subscribe)
- [ ] **DAEM-06**: Daemon API exposes: connection status, current mode, latency, throughput, host info, connected devices, LAN device list

### Desktop GUI

- [ ] **GUI-01**: Tauri + React desktop app for Windows and macOS
- [ ] **GUI-02**: Connect/disconnect button with clear visual state
- [ ] **GUI-03**: Mode toggle between Full Gateway and LAN-Only with descriptions
- [ ] **GUI-04**: Real-time connection status display (mode, latency, throughput)
- [ ] **GUI-05**: Connection progress indicator (never leave user in the dark)
- [ ] **GUI-06**: Error states shown clearly with actionable messages
- [ ] **GUI-07**: System tray icon showing connection state

### CLI

- [ ] **CLI-01**: `homelan connect [--mode full-gateway|lan-only]` command
- [ ] **CLI-02**: `homelan disconnect` command
- [ ] **CLI-03**: `homelan status` command with JSON output
- [ ] **CLI-04**: `homelan switch-mode <mode>` command
- [ ] **CLI-05**: `homelan devices` command lists LAN devices with names and IPs
- [ ] **CLI-06**: All CLI commands show progress and never hang silently
- [ ] **CLI-07**: CLI has automatic retry with status reporting on failures

### Claude Code Integration

- [ ] **CLDE-01**: Claude Code skill definition file for HomeLAN CLI commands
- [ ] **CLDE-02**: Skill can check connection status via daemon API
- [ ] **CLDE-03**: Skill can connect/disconnect and switch modes programmatically
- [ ] **CLDE-04**: Skill can query LAN devices, host info, and network state

### Onboarding & Auth

- [ ] **AUTH-01**: WireGuard key-pair based authentication (no user accounts)
- [ ] **AUTH-02**: New client can onboard via QR code or one-time invite URL from server
- [ ] **AUTH-03**: Key exchange happens securely via relay (HTTPS)
- [ ] **AUTH-04**: First-time setup wizard in GUI guides user through key generation and server connection

### Service Discovery

- [ ] **DISC-01**: Connected clients can see LAN devices with human-readable names
- [ ] **DISC-02**: Device list includes IP, hostname, and device type when available
- [ ] **DISC-03**: Device discovery updates automatically while connected

## v2 Requirements

### Multi-Host

- **MHOST-01**: Client can connect to multiple home networks simultaneously
- **MHOST-02**: Per-host mode selection (Full Gateway on one, LAN-Only on another)

### Mobile Clients

- **MOBL-01**: iOS client with same feature set as desktop
- **MOBL-02**: Android client with same feature set as desktop
- **MOBL-03**: Android TV / Fire TV client
- **MOBL-04**: tvOS client

### Advanced Features

- **ADV-01**: Bandwidth monitoring with mode switching suggestions
- **ADV-02**: Connection history and logging dashboard
- **ADV-03**: Per-app or per-IP routing rules
- **ADV-04**: Multi-device peer auto-discovery without manual key exchange
- **ADV-05**: Full IPv6 support (instead of disabling)

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / login credentials | WireGuard keys are sufficient; adds unnecessary complexity |
| Centralized key server | Contradicts self-hosted philosophy; relay handles key exchange |
| Real-time packet logging | Performance impact; marginal value for personal use |
| Multi-site mesh networking | Scope explosion; single home network for v1 |
| Encrypted profile sync | Adds cloud dependency; local config files sufficient |
| Automatic reconnect on network change | Adds state machine complexity; user controls connect/disconnect |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TUNL-01 | Phase ? | Pending |
| TUNL-02 | Phase ? | Pending |
| TUNL-03 | Phase ? | Pending |
| TUNL-04 | Phase ? | Pending |
| TUNL-05 | Phase ? | Pending |
| TUNL-06 | Phase ? | Pending |
| TUNL-07 | Phase ? | Pending |
| TUNL-08 | Phase ? | Pending |
| TUNL-09 | Phase ? | Pending |
| NAT-01 | Phase ? | Pending |
| NAT-02 | Phase ? | Pending |
| NAT-03 | Phase ? | Pending |
| NAT-04 | Phase ? | Pending |
| NAT-05 | Phase ? | Pending |
| RELY-01 | Phase ? | Pending |
| RELY-02 | Phase ? | Pending |
| RELY-03 | Phase ? | Pending |
| RELY-04 | Phase ? | Pending |
| DAEM-01 | Phase ? | Pending |
| DAEM-02 | Phase ? | Pending |
| DAEM-03 | Phase ? | Pending |
| DAEM-04 | Phase ? | Pending |
| DAEM-05 | Phase ? | Pending |
| DAEM-06 | Phase ? | Pending |
| GUI-01 | Phase ? | Pending |
| GUI-02 | Phase ? | Pending |
| GUI-03 | Phase ? | Pending |
| GUI-04 | Phase ? | Pending |
| GUI-05 | Phase ? | Pending |
| GUI-06 | Phase ? | Pending |
| GUI-07 | Phase ? | Pending |
| CLI-01 | Phase ? | Pending |
| CLI-02 | Phase ? | Pending |
| CLI-03 | Phase ? | Pending |
| CLI-04 | Phase ? | Pending |
| CLI-05 | Phase ? | Pending |
| CLI-06 | Phase ? | Pending |
| CLI-07 | Phase ? | Pending |
| CLDE-01 | Phase ? | Pending |
| CLDE-02 | Phase ? | Pending |
| CLDE-03 | Phase ? | Pending |
| CLDE-04 | Phase ? | Pending |
| AUTH-01 | Phase ? | Pending |
| AUTH-02 | Phase ? | Pending |
| AUTH-03 | Phase ? | Pending |
| AUTH-04 | Phase ? | Pending |
| DISC-01 | Phase ? | Pending |
| DISC-02 | Phase ? | Pending |
| DISC-03 | Phase ? | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 0
- Unmapped: 46 ⚠️

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
