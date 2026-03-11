# Phase 3: Mode Switching & Service Discovery - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable seamless switching between Full Gateway and LAN-Only modes while connected (without dropping the tunnel), plus human-readable device discovery on the home LAN. CLI commands for `switch-mode` and `devices`.

</domain>

<decisions>
## Implementation Decisions

### Mode Switching Behavior
- `homelan switch-mode lan-only|full-gateway` changes routing + DNS without tearing down WireGuard tunnel
- Daemon updates AllowedIPs on the WireGuard peer (0.0.0.0/0 for full-gateway, home subnet only for lan-only)
- DNS configurator already exists — call setDns/restoreDns based on new mode
- Target: mode switch completes in <1 second
- IPC POST /switch-mode already has the contract (IpcSwitchModeRequest/Response) — currently returns 501, needs real implementation
- Emit `mode_changed` SSE event (type already defined in shared types)

### Device Discovery
- Daemon scans home subnet for devices when connected
- Use ARP table parsing (`arp -a` on both Windows and macOS) for immediate discovery
- Reverse DNS / mDNS lookup for hostname resolution where available
- LanDevice type already defined: `{ ip, hostname, deviceType }`
- Poll on configurable interval (default 30s) while connected
- IPC GET /devices already has the contract (IpcDevicesResponse) — needs real data instead of empty array
- Emit `devices_updated` SSE event when device list changes
- Known home devices (from Raphael's network context) can be used as test fixtures: 192.168.7.101 (Windows), 192.168.7.102 (Mac Mini), 192.168.7.152 (Fire TV)

### CLI Commands
- `homelan switch-mode <full-gateway|lan-only>` — thin IPC client, validates mode argument, shows confirmation
- `homelan devices` — shows table of discovered devices (IP, hostname, type), `--json` flag for machine output
- Same patterns as Phase 2 CLI: ora spinner, exit codes, IPC client delegation

### Claude's Discretion
- ARP parsing implementation details
- mDNS/Bonjour library choice (if any)
- Device type inference heuristics
- Polling interval tuning
- Whether to cache device list across reconnections

</decisions>

<specifics>
## Specific Ideas

- Device list should show human-readable names like "Mac Mini - 192.168.7.102" not just IPs
- Mode switching should feel instant — no spinner needed if under 1 second
- Device discovery should start automatically when tunnel connects, not require explicit CLI call

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/types/daemon.ts`: LanDevice, TunnelMode types — already defined
- `packages/shared/src/types/ipc.ts`: IpcSwitchModeRequest/Response, IpcDevicesResponse, SseEventType includes mode_changed + devices_updated
- `packages/daemon/src/platform/dns.ts`: DnsConfigurator — reuse for mode-switch DNS changes
- `packages/daemon/src/wireguard/interface.ts`: WireGuardInterface.configure() — can reconfigure AllowedIPs
- `packages/daemon/src/ipc/routes/switchMode.ts`: Currently returns 501 — needs real implementation
- `packages/daemon/src/ipc/routes/devices.ts`: Currently returns empty array — needs real data
- `packages/daemon/src/utils/execFile.ts`: execFileSafe for `arp -a` parsing
- `packages/cli/src/ipcClient.ts`: IpcClient for new CLI commands

### Established Patterns
- Platform-specific modules with injectable executor (dns.ts, ipv6.ts pattern)
- IPC routes delegate to daemon methods
- CLI commands are thin IPC clients with ora spinners
- StateMachine listeners for SSE event propagation

### Integration Points
- Daemon needs new methods: switchMode(), startDeviceDiscovery(), stopDeviceDiscovery()
- IPC /switch-mode route delegates to daemon.switchMode()
- IPC /devices route returns daemon.lanDevices (populated by discovery)
- CLI adds two new commands to Commander.js program

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-mode-switching-service-discovery*
*Context gathered: 2026-03-11*
