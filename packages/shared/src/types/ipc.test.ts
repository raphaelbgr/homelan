import { describe, it, expectTypeOf } from "vitest";
import type {
  WireguardKeypair,
  DaemonStatus,
  TunnelMode,
  ConnectionState,
} from "./daemon.js";
import type { SseEvent, SseEventType, IpcStatusResponse } from "./ipc.js";

describe("Type contracts", () => {
  it("WireguardKeypair has publicKey but no privateKey", () => {
    // WireguardKeypair must have publicKey
    expectTypeOf<WireguardKeypair>().toHaveProperty("publicKey");
    // privateKey must NOT exist on WireguardKeypair
    // TypeScript compile error if privateKey were present:
    // @ts-expect-error — privateKey intentionally omitted from WireguardKeypair
    const _kp: WireguardKeypair = { publicKey: "abc", privateKey: "secret" };
    void _kp;
  });

  it("TunnelMode only accepts full-gateway or lan-only", () => {
    const validModes: TunnelMode[] = ["full-gateway", "lan-only"];
    // This should be a type error if TunnelMode is not a union of exactly these two
    // @ts-expect-error — invalid mode value
    const _invalid: TunnelMode = "wireguard-only";
    void validModes;
    void _invalid;
  });

  it("ConnectionState is a string union of 5 states", () => {
    const states: ConnectionState[] = [
      "idle",
      "connecting",
      "connected",
      "disconnecting",
      "error",
    ];
    void states;
    // @ts-expect-error — invalid state value
    const _invalid: ConnectionState = "unknown";
    void _invalid;
  });

  it("SseEvent is generic and preserves data type", () => {
    interface Payload {
      message: string;
    }
    type TypedEvent = SseEvent<Payload>;
    expectTypeOf<TypedEvent>().toHaveProperty("type");
    expectTypeOf<TypedEvent>().toHaveProperty("timestampMs");
    expectTypeOf<TypedEvent>().toHaveProperty("data");
    expectTypeOf<TypedEvent["data"]>().toEqualTypeOf<Payload>();
  });

  it("IpcStatusResponse is equivalent to DaemonStatus", () => {
    expectTypeOf<IpcStatusResponse>().toEqualTypeOf<DaemonStatus>();
  });

  it("SseEventType has all required event types", () => {
    const types: SseEventType[] = [
      "state_changed",
      "mode_changed",
      "peer_connected",
      "peer_disconnected",
      "devices_updated",
      "error",
    ];
    void types;
  });
});
