import * as dgram from "node:dgram";

export interface HolePunchResult {
  success: boolean;
  confirmedEndpoint: string | null;
}

const PROBE_PACKET = Buffer.from("HOMELAN\x00\x00\x01");
const PROBE_INTERVAL_MS = 200;

/**
 * Attempts UDP hole punching by sending probe packets to remoteEndpoint every
 * 200ms and waiting for any response back from that address within timeoutMs.
 *
 * @param localPort - UDP port to bind locally (must be available)
 * @param remoteEndpoint - "host:port" format, e.g. "1.2.3.4:51820"
 * @param timeoutMs - how long to wait before giving up
 */
export function attemptHolePunch(
  localPort: number,
  remoteEndpoint: string,
  timeoutMs: number
): Promise<HolePunchResult> {
  const { host: remoteHost, port: remotePort } = parseEndpoint(remoteEndpoint);

  return new Promise<HolePunchResult>((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    let probeInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (probeInterval !== null) {
        clearInterval(probeInterval);
        probeInterval = null;
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      try {
        socket.close();
      } catch {
        // already closed
      }
    }

    function succeed() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ success: true, confirmedEndpoint: remoteEndpoint });
    }

    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ success: false, confirmedEndpoint: null });
    }

    socket.on("error", () => {
      fail();
    });

    socket.on("message", (_msg, rinfo) => {
      // Accept any packet from the remote host:port
      if (rinfo.address === remoteHost && rinfo.port === remotePort) {
        succeed();
      }
    });

    socket.bind(localPort, () => {
      // Start probe loop
      const sendProbe = () => {
        socket.send(PROBE_PACKET, remotePort, remoteHost, () => {
          // Ignore send errors — remote may not be listening yet
        });
      };

      // Send first probe immediately
      sendProbe();

      probeInterval = setInterval(sendProbe, PROBE_INTERVAL_MS);
      timeoutHandle = setTimeout(fail, timeoutMs);
    });
  });
}

/**
 * Parses "host:port" by splitting on the last colon.
 * Handles IPv4 addresses (not IPv6).
 */
function parseEndpoint(endpoint: string): { host: string; port: number } {
  const colonIdx = endpoint.lastIndexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Invalid endpoint format (expected "host:port"): ${endpoint}`);
  }
  const host = endpoint.slice(0, colonIdx);
  const port = parseInt(endpoint.slice(colonIdx + 1), 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port in endpoint: ${endpoint}`);
  }
  return { host, port };
}
