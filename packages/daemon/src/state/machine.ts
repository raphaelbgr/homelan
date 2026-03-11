import type { ConnectionState } from "@homelan/shared";

type TransitionListener = (next: ConnectionState, prev: ConnectionState) => void;

const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  idle: ["connecting"],
  connecting: ["connected", "error"],
  connected: ["disconnecting", "error"],
  disconnecting: ["idle", "error"],
  error: ["idle"],
};

export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateTransitionError";
  }
}

export class StateMachine {
  private _state: ConnectionState = "idle";
  private _listeners: TransitionListener[] = [];

  get state(): ConnectionState {
    return this._state;
  }

  transition(next: ConnectionState): void {
    const allowed = VALID_TRANSITIONS[this._state] ?? [];
    if (!allowed.includes(next)) {
      throw new StateTransitionError(
        `Invalid transition: ${this._state} -> ${next}. Allowed from ${this._state}: [${allowed.join(", ")}]`
      );
    }
    const prev = this._state;
    this._state = next;
    // Listeners called synchronously
    for (const fn of this._listeners) {
      fn(next, prev);
    }
  }

  onTransition(fn: TransitionListener): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }
}
