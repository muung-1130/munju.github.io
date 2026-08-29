import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Real backup freshness, read directly off disk. These directories are local-fs
 * paths rather than a URL because that's genuinely how backups land today; when
 * this moves to real infrastructure the likely replacement is an object-storage
 * listing (S3/MinIO) behind the same env-var-configured pattern used elsewhere
 * in lib/ — swap the implementation, keep the `LiveBackupInfo` shape.
 */

export type LiveBackupInfo = {
  directory: string;
  fileName: string;
  sizeMb: number;
  ageMinutes: number;
  mtime: string;
};

async function newestFileIn(dir: string): Promise<LiveBackupInfo | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile());
    if (files.length === 0) return null;

    const stats = await Promise.all(
      files.map(async (f) => {
        const full = path.join(dir, f.name);
        const s = await stat(full);
        return { name: f.name, size: s.size, mtime: s.mtime };
      }),
    );

    stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const newest = stats[0];

    return {
      directory: dir,
      fileName: newest.name,
      sizeMb: Math.round((newest.size / 1024 / 1024) * 100) / 100,
      ageMinutes: Math.round((Date.now() - newest.mtime.getTime()) / 60000),
      mtime: newest.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getLivePostgresBackup(): Promise<LiveBackupInfo | null> {
  return newestFileIn(process.env.PG_BACKUP_DIR ?? "/home/kevin/db-backups");
}

export async function getLiveMongoBackup(): Promise<LiveBackupInfo | null> {
  return newestFileIn(process.env.MONGO_BACKUP_DIR ?? "/home/kevin/docker-emergency-backup");
}
