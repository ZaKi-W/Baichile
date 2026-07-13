import { createHash } from 'node:crypto';
import { collections } from './collections';
import type { Database } from './database';
import { tooManyRequests } from './errors';
import type { RateLimitDoc } from './models';

export class PersistentRateLimiter {
  private operations = 0;

  constructor(private readonly db: Database) {}

  async consume(key: string, limit: number, windowMs: number): Promise<void> {
    const id = createHash('sha256').update(key).digest('hex');
    await this.db.transaction(async (tx) => {
      const collection = tx.collection<RateLimitDoc>(collections.rateLimits);
      const now = tx.now();
      const current = await collection.get(id);
      const expired = !current || new Date(current.expiresAt).getTime() <= now.getTime();
      const count = expired ? 1 : current.count + 1;
      if (count > limit) tooManyRequests();
      const expiresAt = expired ? new Date(now.getTime() + windowMs) : new Date(current.expiresAt);
      await collection.upsert(id, {
        id,
        count,
        windowStartedAt: expired ? now.toISOString() : current.windowStartedAt,
        expiresAt: expiresAt.toISOString(),
        updatedAt: now.toISOString(),
      });
    });
    this.operations += 1;
    if (this.operations % 100 === 0) await this.cleanupExpired();
  }

  private async cleanupExpired(): Promise<void> {
    const collection = this.db.collection<RateLimitDoc>(collections.rateLimits);
    const rows = await collection.list({ orderBy: [['expiresAt', 'asc']], limit: 50 });
    const now = Date.now();
    await Promise.all(rows
      .filter((row) => new Date(row.expiresAt).getTime() <= now)
      .map((row) => collection.remove(row.id)));
  }
}
