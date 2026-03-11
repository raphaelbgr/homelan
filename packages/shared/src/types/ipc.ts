import type { DaemonStatus, TunnelMode, LanDevice } from "./daemon.js";

export type IpcStatusResponse = DaemonStatus;

export interface IpcDevicesResponse {
  devices: LanDevice[];
}

export interface IpcConnectRequest {
  mode: TunnelMode;
}

export interface IpcConnectResponse {
  ok: boolean;
  message: string;
}

export interface IpcDisconnectResponse {
  ok: boolean;
  message: string;
}

export interface IpcSwitchModeRequest {
  mode: TunnelMode;
}

export interface IpcSwitchModeResponse {
  ok: boolean;
  message: string;
}

export type SseEventType =
  | "state_changed"
  | "mode_changed"
  | "peer_connected"
  | "peer_disconnected"
  | "devices_updated"
  | "error";

export interface SseEvent<T = unknown> {
  type: SseEventType;
  timestampMs: number;
  data: T;
}

export interface IpcError {
  error: string;
  code: string;
}
