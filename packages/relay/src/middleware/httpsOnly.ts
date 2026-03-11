import type { Request, Response, NextFunction } from "express";
import type { RelayError } from "@homelan/shared";

export function httpsOnlyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // In development mode, skip HTTPS enforcement
  if (process.env["NODE_ENV"] === "development") {
    next();
    return;
  }

  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (!isSecure) {
    const error: RelayError = {
      error: "HTTPS is required",
      code: "HTTPS_REQUIRED",
    };
    res.status(400).json(error);
    return;
  }

  next();
}
