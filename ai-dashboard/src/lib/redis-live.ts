import { createClient, type RedisClientType } from "redis";

/**
 * Real Redis INFO stats from the dev instance. Read-only (INFO only).
 * Returns `null` on any failure so callers fall back to simulated RedisStats.
 */

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

async function getClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_HOST) return null;
  if (client?.isOpen) return client;

  if (!connecting) {
    const c = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
        connectTimeout: 2000,
        reconnectStrategy: false,
      },
    }) as RedisClientType;
    c.on("error", () => {
      // swallow background socket errors — callers see failures via getLiveRedisStats() returning null
    });
    connecting = c.connect().then(() => c);
  }

  try {
    client = await connecting;
    return client;
  } catch {
    connecting = null;
    client = null;
    return null;
  }
}

function parseInfo(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

export type LiveRedisStats = {
  connectedClients: number;
  usedMemoryMb: number;
  maxMemoryMb: number;
  hitRatioPct: number;
  evictedKeys: number;
  totalKeys: number;
  uptimeDays: number;
};

export async function getLiveRedisStats(): Promise<LiveRedisStats | null> {
  const c = await getClient();
  if (!c) return null;

  try {
    const raw = await Promise.race([
      c.info(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    const info = parseInfo(raw);

    const hits = parseInt(info.keyspace_hits ?? "0", 10);
    const misses = parseInt(info.keyspace_misses ?? "0", 10);
    const totalLookups = hits + misses;

    let totalKeys = 0;
    for (const [key, value] of Object.entries(info)) {
      if (key.startsWith("db")) {
        const match = /keys=(\d+)/.exec(value);
        if (match) totalKeys += parseInt(match[1], 10);
      }
    }

    return {
      connectedClients: parseInt(info.connected_clients ?? "0", 10),
      usedMemoryMb: Math.round((parseInt(info.used_memory ?? "0", 10) / 1024 / 1024) * 10) / 10,
      maxMemoryMb: Math.round((parseInt(info.maxmemory ?? "0", 10) / 1024 / 1024) * 10) / 10,
      hitRatioPct: totalLookups > 0 ? Math.round((hits / totalLookups) * 1000) / 10 : 100,
      evictedKeys: parseInt(info.evicted_keys ?? "0", 10),
      totalKeys,
      uptimeDays: Math.round((parseInt(info.uptime_in_seconds ?? "0", 10) / 86400) * 10) / 10,
    };
  } catch {
    client = null;
    connecting = null;
    return null;
  }
}
