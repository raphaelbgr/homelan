import { describe, it, expectTypeOf } from "vitest";
import type { ConnectionProgress } from "./nat.js";
import type { InviteResponse, PairRequest, PairResponse } from "./relay.js";

describe("ConnectionProgress", () => {
  it("includes trying_ddns between trying_relay and connected", () => {
    const progress: ConnectionProgress[] = [
      "discovering_peer",
      "trying_direct",
      "trying_relay",
      "trying_ddns",
      "connected",
      "error",
    ];
    void progress;
  });

  it("rejects invalid progress values", () => {
    // @ts-expect-error — invalid progress step
    const _invalid: ConnectionProgress = "trying_ip6";
    void _invalid;
  });
});

describe("InviteResponse", () => {
  it("has inviteUrl, token, and expiresAt fields", () => {
    expectTypeOf<InviteResponse>().toHaveProperty("inviteUrl");
    expectTypeOf<InviteResponse>().toHaveProperty("token");
    expectTypeOf<InviteResponse>().toHaveProperty("expiresAt");
  });

  it("expiresAt is a number (Unix ms)", () => {
    expectTypeOf<InviteResponse["expiresAt"]>().toEqualTypeOf<number>();
  });
});

describe("PairRequest", () => {
  it("has token and clientPublicKey fields", () => {
    expectTypeOf<PairRequest>().toHaveProperty("token");
    expectTypeOf<PairRequest>().toHaveProperty("clientPublicKey");
  });
});

describe("PairResponse", () => {
  it("has serverPublicKey and relayUrl fields", () => {
    expectTypeOf<PairResponse>().toHaveProperty("serverPublicKey");
    expectTypeOf<PairResponse>().toHaveProperty("relayUrl");
  });
});
