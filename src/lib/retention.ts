/**
 * 保留与聚合：逐条事件、搜索原词、反馈默认 30 天；按日聚合 stats_daily 默认 90 天。audit_log 不清理。
 * 聚合在删除之前进行，只聚合已结束的日子。
 */
import type { Db } from './db';
import { getSettings, setSetting } from './settings';
import { collectNoClickCandidates } from './events';

const DAY_SQL = `(created_at AT TIME ZONE 'Asia/Shanghai')::date`;
const TODAY_SQL = `(now() AT TIME ZONE 'Asia/Shanghai')::date`;

export async function aggregateDaily(db: Db) {
  await db.query(
    `INSERT INTO stats_daily (day, type, article_id, n, sessions, units)
     SELECT ${DAY_SQL}, type, coalesce(article_id, 0), count(*), count(DISTINCT session_hash), sum(units)
       FROM events WHERE ${DAY_SQL} < ${TODAY_SQL}
       GROUP BY 1, 2, 3
     ON CONFLICT (day, type, article_id) DO UPDATE SET n = EXCLUDED.n, sessions = EXCLUDED.sessions, units = EXCLUDED.units`,
  );
  const searchTypes: [string, string][] = [
    ['search_submit', 'true'],
    ['search_zero', 'result_count = 0'],
    ['search_noclick', 'result_count > 0 AND NOT clicked'],
  ];
  for (const [type, cond] of searchTypes) {
    await db.query(
      `INSERT INTO stats_daily (day, type, article_id, n, sessions, units)
       SELECT ${DAY_SQL}, $1, 0, count(*), count(DISTINCT session_hash), 0
         FROM query_log WHERE ${DAY_SQL} < ${TODAY_SQL} AND ${cond}
         GROUP BY 1
       ON CONFLICT (day, type, article_id) DO UPDATE SET n = EXCLUDED.n, sessions = EXCLUDED.sessions`,
      [type],
    );
  }
}

export async function purge(db: Db) {
  const s = await getSettings(db);
  await collectNoClickCandidates(db);
  await aggregateDaily(db);
  const raw = Math.max(1, s.rawRetentionDays);
  const agg = Math.max(raw, s.aggregateRetentionDays);
  await db.query(`DELETE FROM events WHERE created_at < now() - make_interval(days => $1)`, [raw]);
  await db.query(`DELETE FROM query_log WHERE created_at < now() - make_interval(days => $1)`, [raw]);
  await db.query(`DELETE FROM feedback WHERE created_at < now() - make_interval(days => $1)`, [raw]);
  await db.query(`DELETE FROM stats_daily WHERE day < ${TODAY_SQL} - $1::int`, [agg]);
  await db.query(`DELETE FROM admin_sessions WHERE expires_at < now()`);
  await setSetting(db, 'lastPurgeAt', new Date().toISOString());
  await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ('system', 'retention.purge', $1::jsonb)`, [JSON.stringify({ raw, agg })]);
}

const HOUR = 3600_000;

/** 由 instrumentation 启动：启动 1 分钟后执行一次，之后每 6 小时检查，距上次超过 24 小时才清理。 */
export function startRetentionTimer(getDb: () => Promise<Db>) {
  const tick = async () => {
    try {
      const db = await getDb();
      const s = await getSettings(db);
      if (!s.lastPurgeAt || Date.now() - Date.parse(s.lastPurgeAt) > 24 * HOUR) await purge(db);
      else await collectNoClickCandidates(db);
    } catch (e) {
      console.error('[w11-assist] 保留任务失败', e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 6 * HOUR).unref?.();
}
