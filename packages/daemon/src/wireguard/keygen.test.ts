import { describe, it, expect } from "vitest";
import { generateKeypair } from "./keygen.js";

// Base64 WireGuard key: 32 bytes = 44 base64 chars (43 chars + 1 padding '=')
const WG_KEY_REGEX = /^[A-Za-z0-9+/]{43}=$/;

describe("generateKeypair", () => {
  it("returns publicKey and privateKey as 44-char base64 strings", async () => {
    const keypair = await generateKeypair();
    expect(keypair.publicKey).toMatch(WG_KEY_REGEX);
    expect(keypair.privateKey).toMatch(WG_KEY_REGEX);
  });

  it("generates a different keypair on each call", async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  it("publicKey and privateKey are different values", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    expect(publicKey).not.toBe(privateKey);
  });
});
