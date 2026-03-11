# Architecture Research: Personal VPN/Tunnel System

**Domain:** Personal VPN/tunnel (WireGuard-based, desktop client + relay server)
**Researched:** 2026-03-11
**Confidence:** HIGH (Tailscale/Headscale/NetBird patterns well-established; confirmed with multiple sources)

## Standard Architecture

### System Overview

Personal VPN/tunnel systems follow a **control plane + data plane** separation model, where control (key distribution, peer discovery, configuration) is centralized, but data (encrypted tunnels) flows peer-to-peer.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATIONS LAYER                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Desktop GUI │  │  CLI Tool    │  │  Claude Code Skill   │  │
│  │ (Electron/   │  │  (connect,   │  │  (programmatic       │  │
│  │  Tauri)      │  │   switch,    │  │   integration)       │  │
│  │              │  │   status)    │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────────┘  │
│         │                 │                  │                   │
├─────────┴─────────────────┴──────────────────┴───────────────────┤
│                    CLIENT DAEMON LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  VPN Client Daemon (privileged process)                    │ │
│  │  - WireGuard interface management (wg-go or system native) │ │
│  │  - Relay/DDNS discovery & connection management            │ │
│  │  - Key storage & lifecycle management                      │ │
│  │  - Routing table configuration (mode switching)            │ │
│  │  - Status/metrics collection                               │ │
│  │  - IPC server (for GUI/CLI communication)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                    NETWORK LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐         ┌──────────────────────────┐   │
│  │  Relay Server       │         │  DDNS Provider (optional)│   │
│  │  - Rendezvous point │         │  - Dynamic hostname      │   │
│  │  - Peer discovery   │         │  - Secondary discovery   │   │
│  │  - No traffic relay*│         │                          │   │
│  │  - Lightweight HTTP │         │  *Failover only          │   │
│  │  - Key exchange     │         │                          │   │
│  └─────────────────────┘         └──────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Encrypted Tunnel (WireGuard P2P)                       │    │
│  │  - Direct peer-to-peer UDP connections                  │    │
│  │  - ChaCha20-Poly1305 encryption, Curve25519 keys        │    │
│  │  - NAT traversal via STUN hole-punching                 │    │
│  │  - Falls back to relay server if NAT prevents direct P2P│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                    HOME SERVER (Server-side)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  VPN Server Daemon (any home machine: Windows/Mac/Linux)  │ │
│  │  - WireGuard interface + key management                    │ │
│  │  - Relay server (embedded or external)                     │ │
│  │  - LAN bridge/gateway configuration                        │ │
│  │  - Peer registration & status                              │ │
│  │  - Route injection into home network                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Home Network                                              │ │
│  │  (SMB shares, SSH hosts, local services, other devices)    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Desktop GUI** | User interface for connecting, disconnecting, switching modes, viewing status/metrics | Electron (cross-platform, proven) or Tauri (lightweight, Rust-safe) |
| **CLI Tool** | Programmatic control via command-line (automated scripts, Claude Code integration) | Go, Rust, or Node.js; simple HTTP client to daemon IPC server |
| **Client Daemon** | Core VPN logic: key management, relay/DDNS communication, WireGuard interface control, routing table updates, metrics | Go (Tailscale/Headscale approach) or Rust (NetBird approach) for concurrency |
| **Relay Server** | Peer discovery, initial handshake coordination, key exchange facilitation; NOT traffic relay for v1 (encrypted traffic is P2P only) | Lightweight (Node.js, Go, Rust); deployable on free tier (Vercel, AWS Lambda, small VPS) |
| **WireGuard Interface** | Kernel-level encrypted tunnel; actual P2P UDP packets | wg-go library (cross-platform) or platform-native (Windows VPN API, macOS NetworkExtension) |
| **NAT Traversal / Hole Punching** | UDP hole punching via STUN discovery; fallback to relay-assisted UDP if Symmetric NAT | Built into client daemon; leverages public STUN servers (Google, Cloudflare) + relay server's capability |
| **DDNS Integration** | Secondary discovery method (failover if relay is down); client queries DNS A record instead of relay HTTP endpoint | Query duckdns.org, no-ip.com, or custom DNS; falls back to relay on first failure |

## Recommended Project Structure

```
personal-tunnel/
├── .planning/
│   ├── PROJECT.md                    # Project context & constraints
│   └── research/                     # Research artifacts
│
├── apps/
│   ├── desktop/                      # GUI application
│   │   ├── src/
│   │   │   ├── main.ts              # Tauri/Electron main process
│   │   │   ├── components/          # React/Vue components
│   │   │   ├── services/            # IPC to daemon
│   │   │   └── types/               # TypeScript interfaces
│   │   ├── public/                  # Static assets
│   │   ├── tauri.conf.json          # Tauri config (if Tauri)
│   │   └── package.json
│   │
│   ├── cli/                          # Command-line tool
│   │   ├── src/
│   │   │   ├── main.ts              # CLI entry point
│   │   │   ├── commands/            # connect, disconnect, switch, status
│   │   │   ├── daemon-client.ts     # HTTP/IPC client to daemon
│   │   │   └── formatters.ts        # Output formatting
│   │   └── package.json
│   │
│   └── relay/                        # Relay server (deployable)
│       ├── src/
│       │   ├── main.ts              # HTTP server entry point
│       │   ├── routes/              # /register, /lookup, /rendezvous
│       │   ├── peers/               # Peer state management
│       │   └── crypto/              # Key exchange helpers
│       ├── Dockerfile               # For cloud deployment
│       └── package.json
│
├── packages/
│   ├── client-daemon/               # Core VPN logic (shared by desktop & CLI)
│   │   ├── src/
│   │   │   ├── daemon.ts            # Main daemon process
│   │   │   ├── ipc-server.ts        # IPC/HTTP server for GUI/CLI
│   │   │   ├── wireguard/
│   │   │   │   ├── interface.ts     # WireGuard interface management
│   │   │   │   ├── keyring.ts       # Key generation, storage, lifecycle
│   │   │   │   └── routes.ts        # Routing table updates (mode-aware)
│   │   │   ├── discovery/
│   │   │   │   ├── relay-client.ts  # HTTP communication with relay
│   │   │   │   ├── ddns-lookup.ts   # DDNS fallback discovery
│   │   │   │   └── stun.ts          # STUN endpoint discovery
│   │   │   ├── connection/
│   │   │   │   ├── peer.ts          # Peer connection state machine
│   │   │   │   └── modes.ts         # Full Gateway vs LAN-Only mode logic
│   │   │   └── metrics.ts           # Status, latency, throughput collection
│   │   └── package.json
│   │
│   ├── shared/                       # Shared types, utils, constants
│   │   ├── src/
│   │   │   ├── types.ts             # IPC message types, peer info, etc.
│   │   │   ├── constants.ts         # Default ports, IP ranges, mode names
│   │   │   └── utils.ts             # JSON serialization, validation helpers
│   │   └── package.json
│   │
│   └── wg-go-bindings/              # WireGuard Go bindings (if not using native)
│       ├── src/
│       │   └── index.ts             # Node.js bindings to wg-go
│       └── package.json
│
├── scripts/
│   ├── build-all.sh                 # Multi-app build orchestration
│   ├── deploy-relay.sh              # Relay server deployment
│   └── setup-dev.sh                 # Local development setup
│
├── docker/
│   └── relay.dockerfile             # Relay server containerization
│
├── docs/
│   ├── ARCHITECTURE.md              # Live architecture (this doc becomes reference)
│   ├── SETUP.md                     # Getting started for devs
│   ├── DEPLOYMENT.md                # Relay & server deployment guides
│   └── MODE_SWITCHING.md            # Full Gateway vs LAN-Only technical details
│
└── package.json                      # Monorepo root (pnpm workspaces)
```

### Structure Rationale

- **apps/ vs packages/ separation:** Apps are user-facing (GUI, CLI); packages are reusable libraries. The daemon is a package so CLI and GUI both consume it cleanly via IPC.
- **client-daemon as a package:** Keeps business logic separate from UI/transport. Desktop GUI and CLI both communicate via HTTP/IPC to the same daemon process.
- **discovery/ subfolder:** Consolidates all external communication (relay, DDNS, STUN) in one place; makes fallback logic easier to test and understand.
- **wireguard/ subfolder:** Isolates platform-specific WireGuard calls; easier to swap implementations (native vs wg-go).
- **Relay as an app:** Deployable independently; not bundled with client. Can run on separate server or cloud.
- **shared/ package:** Types, constants, utils shared across daemon, CLI, GUI, and relay reduce duplication and ensure consistency.

## Architectural Patterns

### Pattern 1: Control Plane / Data Plane Separation

**What:** Centralized control server (relay) coordinates connections and distributes peer information, but actual traffic flows directly peer-to-peer via WireGuard.

**When to use:** Any mesh VPN where you want central authority but decentralized data forwarding; allows scales from 2 to thousands of peers without relay becoming a bottleneck.

**Trade-offs:**
- **Pro:** Relay server is lightweight; scales easily; traffic stays encrypted end-to-end.
- **Con:** Initial connection requires relay communication; if relay is down, existing connections persist but new peers can't join.

**Example:**
```typescript
// Client daemon discovers relay endpoint, gets peer info
const peerList = await relayClient.lookup(myPublicKey);
// But actual data flows directly:
const wgInterface = new WireGuardInterface();
peerList.forEach(peer => {
  wgInterface.addPeer(peer.publicKey, peer.endpoint);
});
// Relay is no longer in the data path
```

### Pattern 2: Mode-Aware Routing Table Management

**What:** Two distinct routing configurations (Full Gateway vs LAN-Only) managed by switching routing rules at the daemon level without restarting WireGuard.

**When to use:** When you want seamless switching between "all traffic via home" and "only LAN via tunnel." Avoids reconnection delays.

**Trade-offs:**
- **Pro:** Fast mode switching (milliseconds, not seconds); user experience is smooth.
- **Con:** Requires careful routing table management; needs elevated privileges; platform-specific implementations.

**Example:**
```typescript
// Mode: Full Gateway (all traffic via home)
const fullGatewayRoutes = [
  { dest: "0.0.0.0/0", via: tunnelInterface }, // Default route via tunnel
  { dest: "192.168.7.0/24", via: localNIC }    // But local net direct (to avoid loop)
];

// Mode: LAN-Only (only LAN via tunnel, internet direct)
const lanOnlyRoutes = [
  { dest: "192.168.7.0/24", via: tunnelInterface },  // Only home LAN via tunnel
  // Default route stays on local gateway (client's ISP)
];

// Switch modes without reconnecting:
async function switchMode(newMode: "full-gateway" | "lan-only") {
  const routes = newMode === "full-gateway" ? fullGatewayRoutes : lanOnlyRoutes;
  await routingTable.update(routes);
  // WireGuard tunnel stays up; only routing rules change
}
```

### Pattern 3: Credential-Free Authentication (WireGuard Keys Only)

**What:** WireGuard public/private key pairs are the only credential; no username/password or certificates.

**When to use:** For personal/small-team VPNs where key exchange can be handled offline or via out-of-band channel (email, QR code, USB stick).

**Trade-offs:**
- **Pro:** Simpler than certificate PKI; WireGuard key size is smaller; no password complexity rules.
- **Con:** Lost private key = lost access (no password reset); requires careful key backup strategy; onboarding is manual.

**Example:**
```typescript
// Generate peer keypair (no auth username needed)
const keyPair = generateWireGuardKeyPair();

// Relay endpoint-agnostic; key is the credential
const registerRequest = {
  publicKey: keyPair.public,
  peerId: "raphael-laptop",     // Friendly name only
  // No username, password, email, or MFA
};

// Server stores publicKey → peerId mapping
// Client stores private key in encrypted local storage
```

### Pattern 4: NAT Traversal with Fallback Chain

**What:** Attempt direct P2P (via STUN-discovered endpoints) → fallback to relay-assisted UDP → eventual timeout.

**When to use:** In production VPN systems; handles the 10-20% of NATs that block UDP hole punching (Symmetric NAT, corporate firewalls).

**Trade-offs:**
- **Pro:** Maximizes direct connections; graceful fallback ensures connectivity even in restrictive networks.
- **Con:** Adds latency for symmetric NAT cases; relay fallback uses slightly more bandwidth.

**Example:**
```typescript
async function connectToPeer(peerId: string) {
  const peer = await peerStore.get(peerId);

  // Try 1: Direct P2P using endpoints discovered via STUN
  const stunEndpoints = await stunClient.discover(relayAddress);
  for (const endpoint of stunEndpoints) {
    const direct = await attemptDirectConnection(peer.publicKey, endpoint, 5000);
    if (direct) {
      wgInterface.setPeer(peer.publicKey, endpoint);
      return "direct";
    }
  }

  // Try 2: Relay-assisted (relay doesn't decrypt, just forwards UDP)
  const relayEndpoint = await relayClient.getRelayEndpoint();
  const assisted = await attemptRelayConnection(peer.publicKey, relayEndpoint, 5000);
  if (assisted) {
    wgInterface.setPeer(peer.publicKey, relayEndpoint);
    return "relay-assisted";
  }

  // Fallback: Full relay (worst case, but connectivity guaranteed)
  throw new Error(`Cannot connect to ${peerId}`);
}
```

### Pattern 5: Desktop Client IPC Architecture

**What:** GUI and CLI are separate processes; both communicate with the VPN daemon via HTTP/IPC. Daemon is privileged; clients are not.

**When to use:** Any multi-headed VPN client where GUI, CLI, and automation need to control the same daemon without duplication.

**Trade-offs:**
- **Pro:** Single source of truth (daemon state); GUI and CLI stay in sync; daemon survives GUI crash.
- **Con:** IPC overhead (minor for VPN operations); requires daemon process manager.

**Example:**
```typescript
// Desktop GUI process (unprivileged)
const daemon = new DaemonClient("http://localhost:30001");
async function onConnectButtonClick() {
  const result = await daemon.connect({ relayAddress, mode: "full-gateway" });
  updateUI(result.status);
}

// CLI process (unprivileged)
async function main() {
  const daemon = new DaemonClient("http://localhost:30001");
  const status = await daemon.status();
  console.log(JSON.stringify(status, null, 2));
}

// Both talk to same daemon
// Daemon runs as root/SYSTEM to configure WireGuard/routing
```

## Data Flow

### Connection Establishment Flow

```
[User clicks "Connect" in GUI]
    ↓
[GUI sends HTTP POST to daemon: /connect]
    ↓
[Daemon: resolve relay endpoint (or DDNS fallback)]
    ↓
[Daemon HTTP GET: relay.example.com/lookup?publicKey=...]
    ↓
[Relay returns peer list: [{peerId, publicKey, lastSeen}, ...]]
    ↓
[Daemon: perform STUN endpoint discovery via relay]
    ↓
[Daemon: attempt direct P2P connection to peers]
    ↓
[Daemon: if P2P fails, fallback to relay-assisted]
    ↓
[Daemon: configure WireGuard interface with peer endpoint]
    ↓
[Daemon: apply routing rules (based on mode)]
    ↓
[Daemon HTTP response: {status: "connected", peers: [...], latency: ...}]
    ↓
[GUI updates status display]
    ↓
[Claude Code skill can now access home LAN]
```

### Mode Switching Flow

```
[User switches from "LAN-Only" to "Full Gateway" in GUI]
    ↓
[GUI sends HTTP POST to daemon: /switch-mode {mode: "full-gateway"}]
    ↓
[Daemon validates mode is supported]
    ↓
[Daemon: calculate new routing table entries]
    ↓
[Daemon: apply new routes (ip route add / netstat / Windows API)]
    ↓
[WireGuard tunnel stays connected; data flow changes]
    ↓
[Daemon HTTP response: {status: "ok", mode: "full-gateway", routes: [...]}]
    ↓
[GUI updates mode indicator]
    ↓
[Internet traffic now flows via home; LAN traffic via tunnel]
```

### Key Management Flow

```
[First run: GUI generates WireGuard keypair]
    ↓
[Keypair stored in encrypted local storage (OS keychain / DPAPI)]
    ↓
[User generates QR code / export for relay registration]
    ↓
[Out-of-band: User shares public key with home server]
    ↓
[Server: adds client public key to WireGuard allowed_ips list]
    ↓
[Server: registers public key with relay server]
    ↓
[Next connect: Daemon sends public key to relay]
    ↓
[Relay looks up peers already registered with that key]
    ↓
[Relay returns peer list; connection proceeds]
```

### Key Data Flows (Summary)

1. **Discovery:** Client → Relay (HTTP) → Relay returns peer list; fallback to DDNS DNS query.
2. **Endpoint Discovery:** Client → STUN server (UDP) → STUN returns observed public IP:port.
3. **Tunneling:** Client ↔ Peer (UDP, encrypted by WireGuard).
4. **IPC:** GUI/CLI → Daemon (HTTP on localhost:30001).
5. **Configuration:** Daemon → OS (system calls to set routing, WireGuard config).

## Build Order Implications

Based on component dependencies, recommended implementation order:

1. **Phase 1: Core Daemon + WireGuard**
   - Build `packages/client-daemon` with basic WireGuard interface management.
   - Implement key generation, storage, and lifecycle.
   - Start with stub relay (no actual server yet).
   - Dependency: WireGuard must work end-to-end.

2. **Phase 2: Relay Server**
   - Build `apps/relay` to handle peer registration and lookup.
   - Simple HTTP endpoints: `/register`, `/lookup`.
   - Deploy on local machine or free tier (Vercel, Fly.io).
   - Dependency: Daemon's relay client must be implemented; relay server must be reachable.

3. **Phase 3: CLI Tool**
   - Build `apps/cli` to control daemon.
   - Implement: `connect`, `disconnect`, `status`, `switch-mode`, `list-peers`.
   - Test daemon IPC reliability.
   - Dependency: Daemon's IPC server must be stable.

4. **Phase 4: Desktop GUI**
   - Build `apps/desktop` with Electron or Tauri.
   - Implement UI for same CLI operations.
   - Add real-time status/metrics display.
   - Dependency: Daemon must expose metrics via IPC.

5. **Phase 5: Mode Switching**
   - Implement Full Gateway vs LAN-Only routing in daemon.
   - Add mode toggle to GUI and CLI.
   - Test on actual home network with multiple machines.
   - Dependency: Daemon + relay + CLI/GUI must be working.

6. **Phase 6: NAT Traversal & Fallback**
   - Implement STUN endpoint discovery.
   - Add relay-assisted connection fallback.
   - Test in restrictive networks (corporate firewall, Symmetric NAT).
   - Dependency: Basic P2P connection must work first.

7. **Phase 7: DDNS Fallback**
   - Add DDNS provider integration (duckdns, no-ip, etc.).
   - Fallback to DDNS if relay unreachable.
   - Dependency: Relay working; DDNS provider account set up.

## Scaling Considerations

For personal VPN use case, scaling needs are modest:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **1-10 peers (home network)** | Single relay server instance on free tier; relay stores peer list in memory; no database needed. Daemon runs on one home machine. |
| **10-50 peers (extended network)** | Relay still single instance; consider persistent storage (SQLite) for peer registry. Multiple relay instances possible but not needed at this scale. |
| **50+ peers (community/team)** | Relay needs load balancing and persistent store (PostgreSQL). Consider Headscale-like control plane. Multiple home servers (mesh) possible but out of v1 scope. |

**Key insight:** Relay server is not a bottleneck even at 100s of peers. Typical relay operation (peer lookup) is <10ms. Scaling limit is usually client daemon's ability to manage many WireGuard peers, not the relay.

## Anti-Patterns

### Anti-Pattern 1: Centralizing Data Traffic Through Relay

**What people do:** Build relay server as both coordinator AND packet forwarder, causing all encrypted tunnel traffic to pass through relay.

**Why it's wrong:** Relay becomes a performance bottleneck; fails to scale beyond 10-20 concurrent users; expensive cloud bills; defeats purpose of P2P.

**Do this instead:** Keep relay for discovery/coordination only. WireGuard handles encrypted traffic directly peer-to-peer. Relay never touches user data.

### Anti-Pattern 2: Mixed Privilege Levels in Single Process

**What people do:** GUI and daemon in same process to "simplify" architecture; GUI needs root to configure WireGuard.

**Why it's wrong:** GUI crash takes down daemon; security risk (browser-like attack surface runs as root); harder to test daemon independently.

**Do this instead:** Separate daemon (privileged) from GUI/CLI (unprivileged). Communicate via HTTP/IPC. Daemon can restart without killing GUI.

### Anti-Pattern 3: Hardcoding Relay Address

**What people do:** Hardcode relay server domain in client; no fallback.

**Why it's wrong:** Relay goes down → all clients unable to connect; no graceful degradation; difficult to migrate relay or run backup.

**Do this instead:** Make relay address configurable (config file, QR code). Implement DDNS fallback; add health checks; design for multi-relay failover (future).

### Anti-Pattern 4: Ignoring Mode Switching Routing Complexity

**What people do:** Implement mode switching by disconnecting and reconnecting (full reconnection cycle).

**Why it's wrong:** User sees brief disconnection; disrupts active connections; poor UX.

**Do this instead:** Keep WireGuard tunnel up; swap routing rules only. Requires careful understanding of platform routing APIs (netlink on Linux, ip route on macOS/Windows), but achievable.

### Anti-Pattern 5: No Keyring / Storing Private Keys in Plaintext

**What people do:** Store WireGuard private keys in JSON files without encryption.

**Why it's wrong:** Compromises entire VPN if machine is stolen or malware runs; one incident loses all clients' access.

**Do this instead:** Store private keys in OS keychain (Windows DPAPI, macOS Keychain, Linux secret-service). Encrypt with machine password if available. Rotate keys periodically.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Relay Server** | HTTP(S) to relay endpoints (/register, /lookup, /rendezvous) | Can be self-hosted or cloud; design for multiple relays (failover possible) |
| **STUN Servers** | UDP to public STUN servers (Google, Cloudflare) for endpoint discovery | Already in WireGuard libraries; no custom integration needed |
| **DDNS Provider** | HTTP GET to DNS update endpoint; fallback to relay if DNS stale | Optional but recommended; duckdns, no-ip, etc. |
| **OS APIs (WireGuard)** | Platform-specific (wg-go bindings, Windows VPN API, macOS NetworkExtension) | Abstract via wrapper; test on all three platforms |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **GUI ↔ Daemon** | HTTP on localhost:30001 (JSON RPC or REST) | IPC must be reliable; consider reconnection logic for daemon restarts |
| **CLI ↔ Daemon** | Same HTTP as GUI | Ensures consistency; no separate CLI implementation needed beyond command parsing |
| **Daemon ↔ WireGuard** | System calls (netlink, wg command, or native OS APIs) | Platform-specific; abstract into WireGuard interface module |
| **Daemon ↔ Relay** | HTTP(S) to relay server | Must have timeout/retry logic; be tolerant of relay downtime |
| **Daemon ↔ DDNS** | DNS queries + HTTP updates | Optional in v1; defer if complexity grows |

## Sources

- [Tailscale: How it works](https://tailscale.com/blog/how-tailscale-works) — Control plane / data plane separation model
- [NetBird Architecture: WireGuard and Go Integration for Secure Zero Trust Networking](https://dasroot.net/posts/2026/02/netbird-architecture-wireguard-go-zero-trust/) — Component boundaries, Go concurrency patterns
- [Headscale: Self-hosted Tailscale implementation](https://github.com/juanfont/headscale) — Open-source reference for control plane
- [WireGuard: Protocol & Cryptography](https://www.wireguard.com/protocol/) — Cryptographic foundation, Noise Protocol
- [Tailscale DERP Relay System](https://tailscale.com/kb/1232/derp-servers/) — Relay architecture for fallback connectivity
- [NAT Traversal techniques (STUN, hole punching, relaying)](https://deepwiki.com/pirate/wireguard-docs/4.2-nat-traversal) — Technical foundations
- [OpenVPN3 Linux D-Bus Architecture](https://linuxcommandlibrary.com/man/openvpn3) — IPC patterns for unprivileged clients
- [Tauri vs Electron 2026](https://dasroot.net/posts/2026/03/tauri-vs-electron-rust-cross-platform-apps/) — Desktop framework comparison; Tauri advantages for VPN client
- [Split Tunneling Architecture](https://tailscale.com/learn/what-is-split-tunneling-secure-critical-data-vpn) — Mode switching and selective routing patterns

---

**Architecture research for:** Personal VPN/tunnel system (WireGuard-based)
**Researched:** 2026-03-11
**Next phases:** Implementation should follow build order sequence (Phase 1: Daemon, Phase 2: Relay, Phase 3-7: Client frontends and advanced features)
