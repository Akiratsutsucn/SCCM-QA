import type { Db } from './db';

export interface Settings {
  rawRetentionDays: number;
  aggregateRetentionDays: number;
  reviewCycleDays: number;
  strictRateLimit: boolean;
  lastPurgeAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  rawRetentionDays: 30,
  aggregateRetentionDays: 90,
  reviewCycleDays: 90,
  strictRateLimit: false,
  lastPurgeAt: null,
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]) {
  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, JSON.stringify(value)],
  );
}
