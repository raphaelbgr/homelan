import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().default(3000),
  relaySecret: z.string().min(1),
  ttlSeconds: z.coerce.number().default(300),
  storageType: z.enum(["sqlite", "memory"]).default("sqlite"),
  dbPath: z.string().default("./relay.db"),
  allowedOrigins: z.string().default("*"),
  // serverPublicKey: the HOME SERVER's WireGuard public key returned in /pair response.
  // The relay itself is a discovery server only — it doesn't have a WireGuard interface.
  serverPublicKey: z.string().default(""),
  // relayUrl: the relay's public URL, included in invite URLs and pair responses.
  relayUrl: z.string().default(""),
});

export type RelayConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): RelayConfig {
  const result = ConfigSchema.safeParse({
    port: process.env["PORT"],
    relaySecret: process.env["RELAY_SECRET"],
    ttlSeconds: process.env["RELAY_TTL_SECONDS"],
    storageType: process.env["RELAY_STORAGE"] ?? "sqlite",
    dbPath: process.env["RELAY_DB_PATH"],
    allowedOrigins: process.env["RELAY_ALLOWED_ORIGINS"],
    serverPublicKey: process.env["RELAY_SERVER_PUBLIC_KEY"],
    relayUrl: process.env["RELAY_URL"],
  });
  if (!result.success) {
    const missing = result.error.errors.map((e) => e.path.join(".")).join(", ");
    throw new Error(`Relay config invalid. Missing required: ${missing}`);
  }
  return result.data;
}
