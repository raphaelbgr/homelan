import { generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";

export interface WgKeypair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a WireGuard keypair.
 *
 * Primary: Node.js built-in crypto (X25519/Curve25519). No external dependencies,
 *          works on all platforms without the `wg` binary.
 * Fallback: `wg genkey` + `wg pubkey` via spawn (if Node.js crypto is somehow unavailable).
 *
 * Returns base64-encoded Curve25519 keys (32 bytes = 44 base64 chars).
 * The same format WireGuard expects in configuration files.
 */
export async function generateKeypair(): Promise<WgKeypair> {
  return generateWithNodeCrypto();
}

/**
 * Use Node.js built-in crypto to generate an X25519 (Curve25519) keypair.
 * Extracts the raw 32-byte key material and encodes as base64.
 * No shell execution — pure JavaScript, injection-safe by design.
 */
function generateWithNodeCrypto(): WgKeypair {
  const { privateKey: privKeyObj, publicKey: pubKeyObj } = generateKeyPairSync(
    "x25519"
  );

  // Export as DER, then extract the raw 32-byte key material from the end
  const privDer = privKeyObj.export({ type: "pkcs8", format: "der" });
  const pubDer = pubKeyObj.export({ type: "spki", format: "der" });

  // Raw Curve25519 key is always the last 32 bytes of the DER structure
  const privBytes = Buffer.from(privDer).subarray(-32);
  const pubBytes = Buffer.from(pubDer).subarray(-32);

  return {
    privateKey: privBytes.toString("base64"),
    publicKey: pubBytes.toString("base64"),
  };
}

/**
 * Fallback: generate keypair using `wg` CLI.
 * `wg pubkey` reads from stdin — private key passed via proc.stdin (not shell args).
 * No shell string interpolation — spawn used directly.
 */
export async function generateKeypairWithWgCli(): Promise<WgKeypair> {
  const { stdout: privateKey } = await execWg(["genkey"]);

  if (!privateKey || privateKey.length !== 44) {
    throw new Error(
      `wg genkey returned unexpected output (length ${privateKey.length}). ` +
        "Ensure WireGuard tools are installed (package: wireguard-tools)."
    );
  }

  const publicKey = await derivePublicKeyWithWg(privateKey);
  return { publicKey, privateKey };
}

async function execWg(args: string[]): Promise<{ stdout: string }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("wg", args, {
    timeout: 5000,
    encoding: "utf8",
  });
  return { stdout: stdout.trim() };
}

/**
 * Derive a WireGuard public key from a private key via `wg pubkey`.
 * Uses spawn so private key is passed via stdin (not interpolated into a shell string).
 */
function derivePublicKeyWithWg(privateKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("wg", ["pubkey"], { timeout: 5000 });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(`wg pubkey exited with code ${code}: ${stderr.trim()}`)
        );
        return;
      }
      const key = stdout.trim();
      if (key.length !== 44) {
        reject(
          new Error(
            `wg pubkey returned unexpected output (length ${key.length})`
          )
        );
        return;
      }
      resolve(key);
    });
    proc.on("error", reject);
    proc.stdin.write(privateKey + "\n");
    proc.stdin.end();
  });
}
