/**
 * JSON-file-backed implementation of SkillStore.
 *
 * MVP persistence layer — stores player profiles and match history in a single
 * JSON file with atomic writes (temp-file + rename).
 *
 * ## Migration to SQLite
 * To upgrade from JSON to SQLite:
 * 1. Create a new class implementing SkillStore (e.g., SqliteSkillStore)
 * 2. Use better-sqlite3 or similar for synchronous, WAL-mode SQLite access
 * 3. Tables: `players` (username PK, rating, rd, volatility, games_played)
 *            `matches` (id PK, game_id, winner, loser, metrics JSON, timestamp, rating_changes JSON)
 * 4. Write a one-time migration script that reads data/ratings.json and inserts into SQLite
 * 5. Swap the SkillStore binding in server startup (dependency injection)
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MatchResult, PlayerProfile, SkillStore } from "@tetris/shared";

interface StoreData {
  players: Record<string, PlayerProfile>;
  matches: MatchResult[];
}

function emptyStore(): StoreData {
  return { players: {}, matches: [] };
}

export class JsonSkillStore implements SkillStore {
  private readonly filePath: string;
  /** Promise chain that serializes all write operations. */
  private writeLock: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getPlayer(username: string): Promise<PlayerProfile | null> {
    const data = await this.read();
    return data.players[username] ?? null;
  }

  async upsertPlayer(profile: PlayerProfile): Promise<void> {
    await this.withWriteLock(async () => {
      const data = await this.read();
      data.players[profile.username] = profile;
      await this.write(data);
    });
  }

  async getLeaderboard(): Promise<PlayerProfile[]> {
    const data = await this.read();
    return Object.values(data.players).sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return a.username.localeCompare(b.username);
    });
  }

  async getMatchHistory(
    username: string,
    limit: number,
  ): Promise<MatchResult[]> {
    if (limit <= 0) return [];
    const data = await this.read();
    const filtered = data.matches.filter(
      (m) => m.winner === username || m.loser === username,
    );
    // Most recent first (matches are appended chronologically)
    return filtered.reverse().slice(0, limit);
  }

  async saveMatchResult(result: MatchResult): Promise<void> {
    await this.withWriteLock(async () => {
      const data = await this.read();
      data.matches.push(result);
      await this.write(data);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async read(): Promise<StoreData> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as StoreData;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return emptyStore();
      }
      throw err;
    }
  }

  private async write(data: StoreData): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = join(dir, `.ratings-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  /**
   * Serialize an async write operation through the lock chain.
   * Ensures that concurrent calls don't interleave read-modify-write cycles.
   */
  private withWriteLock(fn: () => Promise<void>): Promise<void> {
    const next = this.writeLock.then(fn, fn);
    this.writeLock = next.catch(() => {
      /* swallow so the chain continues */
    });
    return next;
  }
}
