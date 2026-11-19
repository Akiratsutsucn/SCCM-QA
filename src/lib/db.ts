/**
 * 数据库访问层。
 * 生产：DATABASE_URL=postgres://...（node-postgres 连接池）
 * 本地开发 / 测试：DATABASE_URL=pglite:./data/dev 或 pglite:memory（嵌入式 PostgreSQL，含 pg_trgm）
 * 两者都只暴露 query(sql, params) 与 tx(fn)，SQL 一律参数化。
 */
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';

export type Row = Record<string, any>;

export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type GlobalWithDb = typeof globalThis & { __w11db?: Promise<Db> };
const g = globalThis as GlobalWithDb;

async function createPg(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: 10 });
  const wrap = (client: { query: (s: string, p?: unknown[]) => Promise<{ rows: Row[] }> }): Db => ({
    async query(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      return r.rows as any[];
    },
    tx: (fn) => fn(wrap(client)),
    close: async () => undefined,
  });
  return {
    async query(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows as any[];
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPglite(target: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  let dataDir: string | undefined;
  if (target !== 'memory') {
    dataDir = path.resolve(target);
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const pg = await PGlite.create({ dataDir, extensions: { pg_trgm } });
  // PGlite 是单连接：用互斥保证事务内外语句不交错
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  const raw: Db = {
    async query(sql, params) {
      const r = await pg.query(sql, params as any[]);
      return r.rows as any[];
    },
    tx: (fn) => fn(raw),
    close: async () => undefined,
  };
  return {
    query: (sql, params) => lock(() => raw.query(sql, params)),
    tx: (fn) =>
      lock(async () => {
        await pg.query('BEGIN');
        try {
          const out = await fn(raw);
          await pg.query('COMMIT');
          return out;
        } catch (e) {
          await pg.query('ROLLBACK');
          throw e;
        }
      }),
    close: () => pg.close(),
  };
}

export async function openDb(url: string): Promise<Db> {
  const db = url.startsWith('pglite:') ? await createPglite(url.slice('pglite:'.length)) : await createPg(url);
  await migrate(db);
  return db;
}

async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ id: number }>('SELECT id FROM schema_migrations')).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      for (const stmt of m.sql) await q.query(stmt);
      await q.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
  }
}

/** 进程内单例。首次调用时迁移并写入种子（管理员、词汇、设置）。 */
export function getDb(): Promise<Db> {
  if (!g.__w11db) {
    const url = process.env.DATABASE_URL || 'pglite:./data/dev';
    const p = openDb(url).then(async (db) => {
      const { bootstrap } = await import('./bootstrap');
      await bootstrap(db);
      return db;
    });
    p.catch(() => {
      if (g.__w11db === p) g.__w11db = undefined;
    });
    g.__w11db = p;
  }
  return g.__w11db;
}

/** 测试用：替换单例。 */
export function setDbForTest(db: Db | undefined) {
  g.__w11db = db ? Promise.resolve(db) : undefined;
}
