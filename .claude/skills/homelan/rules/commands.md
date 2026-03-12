# HomeLAN CLI Command Reference

Full reference for all `homelan` CLI commands with syntax, options, exit codes, JSON schemas, and usage examples.

---

## Global Exit Codes

All commands share these exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Operation failed (see stderr for details) |
| 3 | Daemon not running — start the daemon first |

---

## Commands

### `homelan connect`

Connects to the home network via WireGuard tunnel.

**Syntax:**
```
homelan connect [--mode full-gateway|lan-only] [--timeout <sec>] [--retry <n>] [--json]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `lan-only` | Tunnel mode: `lan-only` (LAN traffic only) or `full-gateway` (all traffic routed through home) |
| `--timeout <sec>` | 30 | Seconds before giving up on connection attempt |
| `--retry <n>` | 3 | Number of retry attempts on failure |
| `--json` | false | Output result as JSON instead of spinner UI |

**Exit codes:** 0=connected, 1=failed, 3=daemon not running

**Connection progress steps** (emitted during connect):
- `discovering_peer` — querying relay for peer endpoint
- `trying_direct` — attempting UDP hole punch
- `trying_relay` — falling back to relay proxy
- `trying_ddns` — relay unavailable, resolving DDNS hostname
- `connected` — tunnel established

**Example:**
```bash
# Default: LAN-only mode
homelan connect

# Full gateway (route all traffic through home)
homelan connect --mode full-gateway

# JSON output for scripting
homelan connect --json
```

**JSON output (--json flag):**
```json
{
  "connected": true,
  "mode": "lan-only",
  "latencyMs": 12,
  "fallback_method": null
}
```

**Common failure modes:**
- Exit 1 + "Could not reach home server" — all three tiers failed (relay, DDNS, direct IP)
- Exit 3 — homelan daemon process is not running
- Exit 1 + "already connected" — call `homelan disconnect` first, or check `homelan status`

---

### `homelan disconnect`

Disconnects from the home network and tears down the WireGuard tunnel.

**Syntax:**
```
homelan disconnect [--json]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | false | Output result as JSON |

**Exit codes:** 0=disconnected, 1=failed, 3=daemon not running

**Example:**
```bash
homelan disconnect

# JSON output
homelan disconnect --json
```

**JSON output (--json flag):**
```json
{
  "disconnected": true,
  "duration_ms": 84200
}
```

**Common failure modes:**
- Exit 1 + "not connected" — tunnel was already idle
- Exit 3 — daemon not running

---

### `homelan status`

Reports current tunnel state. Outputs JSON by default (no flag required) — use `--human` for a readable table.

**Syntax:**
```
homelan status [--human]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--human` | false | Print aligned key-value table instead of JSON |

**Exit codes:** 0=ok, 3=daemon not running

**Default JSON output (no flags):**
```json
{
  "state": "connected",
  "mode": "lan-only",
  "latencyMs": 12,
  "uptimeMs": 84200,
  "lanDevices": [
    {
      "ip": "192.168.7.101",
      "hostname": "desktop.local",
      "deviceType": "Windows PC"
    }
  ]
}
```

**`state` field values:**

| Value | Meaning |
|-------|---------|
| `idle` | Not connected, daemon is running |
| `connecting` | Connection attempt in progress |
| `connected` | Tunnel is active |
| `disconnecting` | Disconnect in progress |
| `error` | Last operation failed; call connect to retry |

**`mode` field values:** `"full-gateway"` | `"lan-only"` | `null` (when idle)

**Example:**
```bash
# JSON (default — for scripting)
homelan status

# Human-readable table
homelan status --human

# Parse state in shell
STATE=$(homelan status --json 2>/dev/null | jq -r '.state')
```

**Common failure modes:**
- Exit 3 — daemon not running; parse carefully since no stdout is produced
- `state: "error"` — previous connect() failed; call `homelan connect` to retry

---

### `homelan switch-mode`

Switches between Full Gateway and LAN-Only modes without disconnecting the tunnel.

**Syntax:**
```
homelan switch-mode <full-gateway|lan-only> [--json]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `<mode>` | Yes | `full-gateway` or `lan-only` |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | false | Output result as JSON |

**Exit codes:** 0=switched, 1=failed (not connected), 3=daemon not running

**Example:**
```bash
# Switch to full gateway (route all internet traffic through home)
homelan switch-mode full-gateway

# Switch back to LAN-only
homelan switch-mode lan-only --json
```

**JSON output (--json flag):**
```json
{
  "switched": true,
  "mode": "full-gateway"
}
```

**Common failure modes:**
- Exit 1 + "not connected" — must be connected before switching modes
- Exit 3 — daemon not running

---

### `homelan devices`

Lists discovered devices on the home LAN. Outputs a table by default; use `--json` for structured data.

**Syntax:**
```
homelan devices [--json]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | false | Output JSON array instead of table |

**Exit codes:** 0=ok, 3=daemon not running

**JSON output (--json flag):**
```json
[
  {
    "ip": "192.168.7.101",
    "hostname": "desktop.local",
    "deviceType": "Windows PC"
  },
  {
    "ip": "192.168.7.102",
    "hostname": "mac-mini.local",
    "deviceType": "Mac Mini"
  },
  {
    "ip": "172.24.174.17",
    "hostname": "linux-vm.local",
    "deviceType": "Linux Server"
  },
  {
    "ip": "192.168.7.152",
    "hostname": "firetv.local",
    "deviceType": "Fire TV"
  }
]
```

**`deviceType` values:** `"Windows PC"` | `"Mac Mini"` | `"MacBook"` | `"iPhone"` | `"iPad"` | `"Fire TV"` | `"Android Device"` | `"Linux Server"` | `"Unknown"`

**Note:** Device list is populated after connect() triggers discovery. An empty array means discovery scan is still in progress (waits ~30s for first ARP scan).

**Common failure modes:**
- Exit 3 — daemon not running
- Empty array — not connected, or discovery scan not yet complete

---

### `homelan pair`

Pairs this device with the home server using an invite URL.

**Syntax:**
```
homelan pair <invite-url>
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `<invite-url>` | Yes | Invite URL in `homelan://pair?token=<token>&relay=<url>` format |

**Exit codes:** 0=paired, 1=failed, 3=daemon not running

**Example:**
```bash
homelan pair "homelan://pair?token=abc123&relay=https://relay.example.com"
```

**Invite URL format:** `homelan://pair?token=<one-time-token>&relay=<relay-base-url>`
- Token is single-use and expires after 15 minutes
- Obtain invite URL from the home server (GUI or CLI on the host machine)

**Common failure modes:**
- Exit 1 + "token expired" — token older than 15 minutes; request a new invite
- Exit 1 + "token already used" — invite was already consumed; request a new invite
- Exit 1 + "relay unreachable" — relay server is down; check relay URL
- Exit 3 — daemon not running

---

### `homelan history`

Shows connection history from the local log file (`~/.homelan/history.jsonl`).

**Syntax:**
```
homelan history [--json] [--limit <n>]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | false | Output JSON array instead of table |
| `--limit <n>` | 20 | Number of entries to show (most recent first) |

**Exit codes:** 0=ok, 3=daemon not running

**JSON output (--json flag):**
```json
[
  {
    "timestamp": "2026-03-11T14:32:00Z",
    "action": "connect",
    "mode": "lan-only",
    "duration_ms": null,
    "peer_endpoint": "203.0.113.42:51820",
    "fallback_method": null,
    "error": null
  },
  {
    "timestamp": "2026-03-11T14:45:21Z",
    "action": "disconnect",
    "mode": "lan-only",
    "duration_ms": 801000,
    "peer_endpoint": null,
    "fallback_method": null,
    "error": null
  }
]
```

**`action` values:**

| Value | Meaning |
|-------|---------|
| `connect` | Tunnel connected successfully |
| `disconnect` | Tunnel disconnected |
| `mode_switch` | Mode changed (full-gateway ↔ lan-only) |
| `error` | Connection attempt failed |

**`fallback_method` values:** `null` (direct/relay succeeded) | `"ddns"` | `"direct_ip"`

**Example:**
```bash
# Last 20 sessions (table)
homelan history

# Last 5 as JSON (for debugging)
homelan history --json --limit 5

# All history
homelan history --json --limit 1000
```

---

## Workflow Examples

### 1. Connect and access a file share

```bash
# Connect to home network
homelan connect

# Verify connected
STATUS=$(homelan status 2>/dev/null)
STATE=$(echo "$STATUS" | jq -r '.state')
if [ "$STATE" != "connected" ]; then
  echo "Connection failed"
  exit 1
fi

# Mount SMB share (Mac Mini at 192.168.7.102)
mount -t smb //192.168.7.102/SharedDrive /mnt/home
```

### 2. Check network topology before SSH

```bash
# Get device list as JSON
DEVICES=$(homelan devices --json)

# Find the Linux VM IP
LINUX_IP=$(echo "$DEVICES" | jq -r '.[] | select(.deviceType == "Linux Server") | .ip' | head -1)

if [ -z "$LINUX_IP" ]; then
  echo "Linux VM not found on LAN"
  exit 1
fi

# SSH into it
ssh raphaelbgr@$LINUX_IP
```

### 3. Switch to Full Gateway for internet routing

```bash
# Check current state and mode
STATUS=$(homelan status 2>/dev/null)
EXIT=$?

if [ $EXIT -eq 3 ]; then
  echo "Daemon not running"
  exit 1
fi

STATE=$(echo "$STATUS" | jq -r '.state')
MODE=$(echo "$STATUS" | jq -r '.mode')

if [ "$STATE" != "connected" ]; then
  echo "Not connected — connect first"
  homelan connect
fi

if [ "$MODE" != "full-gateway" ]; then
  homelan switch-mode full-gateway
  echo "Switched to full-gateway mode"
fi
```

### 4. Onboard a new machine

```bash
# Paste or scan the invite URL from the home server
INVITE_URL="homelan://pair?token=abc123xyz&relay=https://relay.example.com"

homelan pair "$INVITE_URL"

if [ $? -eq 0 ]; then
  echo "Paired successfully"
  homelan connect
  homelan status --human
else
  echo "Pairing failed — check invite URL or request a new one"
fi
```

### 5. Debug a failed connection

```bash
# Get last 5 history entries
HISTORY=$(homelan history --json --limit 5)

echo "$HISTORY" | jq -r '.[] | "\(.timestamp) \(.action) mode=\(.mode // "N/A") fallback=\(.fallback_method // "none") error=\(.error // "none")'
```

Expected output when debugging relay failure:
```
2026-03-11T14:00:00Z error mode=lan-only fallback=ddns error=relay unreachable, used DDNS fallback
2026-03-11T13:55:00Z connect mode=lan-only fallback=none error=none
```

If `fallback_method` is consistently `"ddns"` or `"direct_ip"`, the relay server may be down — check relay health at `GET /health` on the relay URL.
