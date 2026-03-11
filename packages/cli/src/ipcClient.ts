export class IpcClientError extends Error {
  public readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null) {
    super(message);
    this.name = "IpcClientError";
    this.statusCode = statusCode;
  }
}

export interface IpcClientOptions {
  baseUrl?: string;
}

export class IpcClient {
  private readonly baseUrl: string;

  constructor(options: IpcClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:30001";
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "GET" });
    if (!res.ok) {
      throw new IpcClientError(
        `GET ${path} failed with status ${res.status}`,
        res.status
      );
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new IpcClientError(
        `POST ${path} failed with status ${res.status}`,
        res.status
      );
    }
    return res.json() as Promise<T>;
  }

  async isRunning(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/health`, { method: "GET" });
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).cause !== null &&
        typeof (err as NodeJS.ErrnoException).cause === "object" &&
        (
          (err as NodeJS.ErrnoException).cause as { code?: string } | undefined
        )?.code === "ECONNREFUSED"
      ) {
        return false;
      }
      // Any connection error means daemon is not running
      return false;
    }
  }
}
