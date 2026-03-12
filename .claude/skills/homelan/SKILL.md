# HomeLAN

Personal VPN tunnel tool for accessing home LAN resources from anywhere via WireGuard.
Controls the tunnel, checks connection status, manages device discovery, and handles onboarding.

## When to Use

Use this skill whenever you need to:
- Check if the home tunnel is connected before accessing LAN resources
- Connect to or disconnect from the home network
- Switch between Full Gateway (all traffic) and LAN-Only (LAN traffic only) modes
- List devices on the home network (file shares, SSH servers, local APIs)
- Pair a new device with the home server
- Review connection history for debugging

## Prerequisites

The homelan daemon must be running. Check with:
```bash
homelan status --json
```
Exit code 3 = daemon not running. If not running, the user must start it (daemon lifecycle is not managed by Claude).

## Quick Reference

@.claude/skills/homelan/rules/commands.md

## Status Detection Pattern

Always check connection state before accessing LAN resources:
```bash
STATUS=$(homelan status --json 2>/dev/null)
EXIT=$?
if [ $EXIT -eq 3 ]; then echo "Daemon not running"; exit 1; fi
STATE=$(echo "$STATUS" | jq -r '.state')
if [ "$STATE" != "connected" ]; then homelan connect; fi
```

## Error Handling

All commands return structured exit codes:
- 0: success
- 1: operation failed (check stderr for details)
- 3: daemon not running

For --json commands, parse stdout for structured error details.
