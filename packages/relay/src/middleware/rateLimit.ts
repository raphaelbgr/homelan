import type { Request, Response, NextFunction } from "express";
import type { RelayError } from "@homelan/shared";

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const windows = new Map<string, WindowState>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    // Clean expired windows on each request (keep memory bounded)
    for (const [key, state] of windows) {
      if (now - state.windowStart >= options.windowMs) {
        windows.delete(key);
      }
    }

    const state = windows.get(ip);
    if (!state || now - state.windowStart >= options.windowMs) {
      windows.set(ip, { count: 1, windowStart: now });
      next();
      return;
    }

    state.count++;
    if (state.count > options.maxRequests) {
      const error: RelayError = {
        error: "Too many requests",
        code: "RATE_LIMITED",
      };
      res.status(429).json(error);
      return;
    }

    next();
  };
}
