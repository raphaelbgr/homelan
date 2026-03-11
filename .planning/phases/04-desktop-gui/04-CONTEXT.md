# Phase 4: Desktop GUI - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a single-click desktop client (Tauri 2.x + React 19) for Windows and macOS. Surfaces core functionality: connect/disconnect, mode toggle, real-time status, device list, connection progress, error states, and system tray icon. The GUI is a visual layer over the existing daemon IPC API.

</domain>

<decisions>
## Implementation Decisions

### Framework & Stack
- Tauri 2.x for native shell (Rust backend, OS WebView)
- React 19 for frontend (already decided in PROJECT.md)
- Tailwind CSS + shadcn/ui for styling (decided in roadmap research)
- Vite as bundler (standard for Tauri + React)
- The GUI package lives at `packages/gui/` (already exists as placeholder)
- GUI communicates with daemon via HTTP IPC on localhost:30001 (same as CLI)

### Main Window Layout
- Single-page dashboard, not multi-page navigation
- Top section: large Connect/Disconnect button with clear state coloring (green=connected, gray=disconnected, yellow=connecting)
- Below button: mode toggle (Full Gateway / LAN-Only) with brief description of each
- Status section: connection state, latency (ms), uptime, current mode
- Device list: table of discovered LAN devices (IP, hostname, type) — auto-refreshes via SSE
- Compact layout — window should feel like a utility app, not a full application (think Mullvad VPN or Tailscale client)

### Connection Progress
- When connecting: button shows spinner, status area shows step-by-step progress (Discovering peer → Trying direct → Using relay → Connected)
- Progress steps come from daemon SSE `connection_progress` events
- Never leave user staring at a spinner with no context

### Error States
- Actionable error messages, not technical jargon
- "Relay unreachable. Check your internet connection." not "ECONNREFUSED 127.0.0.1:30001"
- "Daemon not running. Start HomeLAN service first." not "fetch failed"
- Error banner at top of window, dismissible

### System Tray
- Tray icon shows connection state: connected (green dot), disconnected (gray dot), connecting (yellow dot)
- Left-click: toggle window visibility
- Right-click context menu: Connect/Disconnect, Switch Mode, Quit
- Minimize to tray instead of closing (standard VPN client behavior)

### Mode Toggle
- Two-option toggle (not dropdown) — Full Gateway / LAN-Only
- Each option has a one-line description visible at all times
- Toggle is disabled while disconnected (mode only matters when connected)
- Switching mode triggers daemon's switchMode() — no reconnect needed

### Claude's Discretion
- Exact color palette and spacing
- shadcn/ui component selection
- Animation/transition details
- Window dimensions and resize behavior
- Tauri Rust backend boilerplate structure
- Whether to use TanStack Query or raw fetch + SSE

</decisions>

<specifics>
## Specific Ideas

- App should feel like Mullvad VPN client or Tailscale — compact, utility-focused, not bloated
- The big Connect button is the hero element — it should be immediately obvious what to do
- Device list is secondary information — visible but not competing with connection controls
- System tray is essential — users expect VPN clients to live in the tray

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/types/ipc.ts`: All IPC request/response types — GUI uses same contracts as CLI
- `packages/shared/src/types/daemon.ts`: DaemonStatus, ConnectionState, TunnelMode, LanDevice, PeerInfo
- `packages/cli/src/ipcClient.ts`: HTTP IPC client pattern — GUI needs its own fetch wrapper but same API
- SSE event types already defined: state_changed, mode_changed, devices_updated, connection_progress, error

### Established Patterns
- Daemon is single source of truth — GUI just displays daemon state
- All state changes come via SSE events — no polling needed
- IPC endpoints: GET /status, GET /devices, GET /events (SSE), POST /connect, POST /disconnect, POST /switch-mode

### Integration Points
- GUI fetches initial state via GET /status on mount
- GUI subscribes to GET /events (SSE) for real-time updates
- User actions POST to daemon IPC (same as CLI)
- System tray managed by Tauri's native tray API
- Window lifecycle managed by Tauri (show/hide/minimize-to-tray)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-desktop-gui*
*Context gathered: 2026-03-11*
