import { describe, it, expect, vi } from "vitest";
import { StateMachine, StateTransitionError } from "./machine.js";

describe("StateMachine", () => {
  it("starts in idle state", () => {
    const m = new StateMachine();
    expect(m.state).toBe("idle");
  });

  describe("valid transitions", () => {
    it("idle -> connecting", () => {
      const m = new StateMachine();
      m.transition("connecting");
      expect(m.state).toBe("connecting");
    });

    it("connecting -> connected", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("connected");
      expect(m.state).toBe("connected");
    });

    it("connecting -> error", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("error");
      expect(m.state).toBe("error");
    });

    it("connected -> disconnecting", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("connected");
      m.transition("disconnecting");
      expect(m.state).toBe("disconnecting");
    });

    it("disconnecting -> idle", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("connected");
      m.transition("disconnecting");
      m.transition("idle");
      expect(m.state).toBe("idle");
    });

    it("connected -> error", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("connected");
      m.transition("error");
      expect(m.state).toBe("error");
    });

    it("error -> idle", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("error");
      m.transition("idle");
      expect(m.state).toBe("idle");
    });
  });

  describe("invalid transitions throw StateTransitionError", () => {
    it("idle -> disconnecting throws with descriptive message", () => {
      const m = new StateMachine();
      expect(() => m.transition("disconnecting")).toThrow(StateTransitionError);
      expect(() => m.transition("disconnecting")).toThrow(/idle/);
      expect(() => m.transition("disconnecting")).toThrow(/disconnecting/);
    });

    it("idle -> connected throws", () => {
      const m = new StateMachine();
      expect(() => m.transition("connected")).toThrow(StateTransitionError);
    });

    it("connected -> connecting throws", () => {
      const m = new StateMachine();
      m.transition("connecting");
      m.transition("connected");
      expect(() => m.transition("connecting")).toThrow(StateTransitionError);
    });

    it("error message includes current state and attempted state", () => {
      const m = new StateMachine();
      let caught: unknown;
      try {
        m.transition("disconnecting");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(StateTransitionError);
      const err = caught as StateTransitionError;
      expect(err.message).toContain("idle");
      expect(err.message).toContain("disconnecting");
    });
  });

  describe("onTransition listener", () => {
    it("listener is called on valid transition with (next, prev)", () => {
      const m = new StateMachine();
      const listener = vi.fn();
      m.onTransition(listener);
      m.transition("connecting");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("connecting", "idle");
    });

    it("unsubscribe function removes the listener", () => {
      const m = new StateMachine();
      const listener = vi.fn();
      const unsubscribe = m.onTransition(listener);
      unsubscribe();
      m.transition("connecting");
      expect(listener).not.toHaveBeenCalled();
    });

    it("listeners are called synchronously", () => {
      const m = new StateMachine();
      const order: string[] = [];
      m.onTransition(() => {
        order.push("listener");
      });
      order.push("before");
      m.transition("connecting");
      order.push("after");
      expect(order).toEqual(["before", "listener", "after"]);
    });

    it("multiple listeners all called", () => {
      const m = new StateMachine();
      const l1 = vi.fn();
      const l2 = vi.fn();
      m.onTransition(l1);
      m.onTransition(l2);
      m.transition("connecting");
      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });
});
