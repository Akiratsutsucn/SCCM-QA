/**
 * 统计查询（口径见规格 04 第 7.2 节）。四类分开：使用情况 / 匿名自报发生量 / 结果反馈 / 内容健康。
 * 近期数据取自逐条表；超出逐条保留期的部分取自 stats_daily 聚合（两者按日期不重叠）。
 */
import type { Db } from './db';

export interface StatRange { days: number }

const SINCE = `(now() AT TIME ZONE 'Asia/Shanghai')::date - $1::int + 1`;

async function rawCutoff(db: Db): Promise<string> {
  const r = await db.query<{ d: string | null }>(`SELECT to_char(min((created_at AT TIME ZONE 'Asia/Shanghai')::date), 'YYYY-MM-DD') AS d FROM (SELECT created_at FROM events UNION ALL SELECT created_at FROM query_log) x`);
  return r[0]?.d ?? '9999-12-31';
}

export async function usageStats(db: Db, days: number) {
  const cutoff = await rawCutoff(db);
  const q = await db.query<{ submits: number; zero: number; noclick: number; sessions: number }>(
    `SELECT count(*)::int AS submits, count(*) FILTER (WHERE result_count = 0)::int AS zero,
            count(*) FILTER (WHERE result_count > 0 AND NOT clicked)::int AS noclick,
            count(DISTINCT session_hash)::int AS sessions
       FROM query_log WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date >= ${SINCE}`, [days],
  );
  const agg = await db.query<{ type: string; n: number }>(
    `SELECT type, sum(n)::int AS n FROM stats_daily WHERE day >= ${SINCE} AND day < $2::date GROUP BY type`, [days, cutoff],
  );
  const a = (t: string) => agg.find((x) => x.type === t)?.n ?? 0;
  const views = await countEvents(db, days, cutoff, 'article_view');
  return {
    submits: q[0].submits + a('search_submit'),
    zero: q[0].zero + a('search_zero'),
    noclick: q[0].noclick + a('search_noclick'),
    views: views.n,
    guideAnswers: (await countEvents(db, days, cutoff, 'guide_answer')).n,
    galleryPicks: (await countEvents(db, days, cutoff, 'gallery_view')).n,
  };
}

async function countEvents(db: Db, days: number, cutoff: string, type: string) {
  const raw = await db.query<{ n: number; sessions: number; units: number }>(
    `SELECT count(*)::int AS n, count(DISTINCT session_hash)::int AS sessions, coalesce(sum(units), 0)::int AS units
       FROM events WHERE type = $2 AND (created_at AT TIME ZONE 'Asia/Shanghai')::date >= ${SINCE}`, [days, type],
  );
  const agg = await db.query<{ n: number; sessions: number; units: number }>(
    `SELECT coalesce(sum(n),0)::int AS n, coalesce(sum(sessions),0)::int AS sessions, coalesce(sum(units),0)::int AS units
       FROM stats_daily WHERE type = $2 AND day >= ${SINCE} AND day < $3::date`, [days, type, cutoff],
  );
  return { n: raw[0].n + agg[0].n, sessions: raw[0].sessions + agg[0].sessions, units: raw[0].units + agg[0].units };
}

export async function reportStats(db: Db, days: number) {
  const cutoff = await rawCutoff(db);
  const encounter = await countEvents(db, days, cutoff, 'report_encounter');
  const resolved = await countEvents(db, days, cutoff, 'report_resolved');
  const unresolved = await countEvents(db, days, cutoff, 'report_unresolved');
  const changes = await db.query<{ n: number }>(
    `SELECT coalesce(sum(changes), 0)::int AS n FROM events WHERE type IN ('report_resolved','report_unresolved') AND (created_at AT TIME ZONE 'Asia/Shanghai')::date >= ${SINCE}`, [days],
  );
  const capped = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE type = 'report_encounter' AND units >= 20 AND (created_at AT TIME ZONE 'Asia/Shanghai')::date >= ${SINCE}`, [days],
  );
  return { encounter, resolved, unresolved, changes: changes[0].n, capped: capped[0].n };
}

/** 按文章拆分（近期逐条数据）。 */
export async function perArticle(db: Db, days: number) {
  return db.query<{ id: number; title: string; views: number; encounter: number; encounter_sessions: number; units: number; resolved: number; unresolved: number }>(
    `SELECT a.id, a.published->>'title' AS title,
            count(*) FILTER (WHERE e.type = 'article_view')::int AS views,
            count(*) FILTER (WHERE e.type = 'report_encounter')::int AS encounter,
            count(DISTINCT e.session_hash) FILTER (WHERE e.type = 'report_encounter')::int AS encounter_sessions,
            coalesce(sum(e.units) FILTER (WHERE e.type = 'report_encounter'), 0)::int AS units,
            count(*) FILTER (WHERE e.type = 'report_resolved')::int AS resolved,
            count(*) FILTER (WHERE e.type = 'report_unresolved')::int AS unresolved
       FROM articles a JOIN events e ON e.article_id = a.id
      WHERE (e.created_at AT TIME ZONE 'Asia/Shanghai')::date >= ${SINCE}
      GROUP BY a.id ORDER BY encounter DESC, views DESC LIMIT 100`, [days],
  );
}

export async function contentHealth(db: Db, reviewCycleDays: number) {
  const r = await db.query<{ published: number; drafts: number; archived: number; review: number; broken: number; unchecked: number }>(
    `SELECT count(*) FILTER (WHERE status = 'published')::int AS published,
            count(*) FILTER (WHERE status = 'draft')::int AS drafts,
            count(*) FILTER (WHERE status = 'archived')::int AS archived,
            count(*) FILTER (WHERE status = 'published' AND reviewed_at < (now() AT TIME ZONE 'Asia/Shanghai')::date - $1::int)::int AS review,
            (SELECT count(*) FROM media WHERE broken)::int AS broken,
            (SELECT count(*) FROM media WHERE NOT redaction_checked)::int AS unchecked
       FROM articles`, [reviewCycleDays],
  );
  return r[0];
}
