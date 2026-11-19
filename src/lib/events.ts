/**
 * 匿名事件写入（口径见规格 04 第 4 节）。所有写入都按幂等键去重。
 * 「已解决 / 没解决」同一会话同一文章互斥：存为一个 outcome 事件，改口时更新 type 并 changes+1。
 */
import type { Db } from './db';
import { hashKey } from './http';
import { redact, clip } from './redact';
import { extractCodes } from './errorcode';

export const EVENT_TYPES = ['search_click', 'gallery_view', 'guide_answer', 'article_view', 'report_encounter', 'report_resolved', 'report_unresolved'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const MAX_UNITS = 20;

export async function logSearch(db: Db, p: { submitKey: string; sessionHash: string | null; query: string; resultCount: number }) {
  const { text, changed } = redact(clip(p.query, 200));
  const code = extractCodes(text)[0] ?? null;
  const idem = hashKey(['search', p.submitKey]);
  const rows = await db.query<{ id: number }>(
    `INSERT INTO query_log (idem_key, raw_redacted, was_redacted, code, result_count, session_hash)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (idem_key) DO NOTHING RETURNING id`,
    [idem, text, changed, code, p.resultCount, p.sessionHash],
  );
  if (rows[0] && p.resultCount === 0) {
    await db.query(`INSERT INTO candidates (source, ref_id, text) VALUES ('zero_result', $1, $2) ON CONFLICT DO NOTHING`, [rows[0].id, text]);
  }
  return rows[0]?.id ?? (await db.query<{ id: number }>('SELECT id FROM query_log WHERE idem_key = $1', [idem]))[0]?.id;
}

export interface EventInput {
  type: EventType;
  sessionHash: string;
  articleId?: number | null;
  nodeId?: number | null;
  submitKey?: string | null;
  units?: number;
  optionId?: number | null;
}

export async function recordEvent(db: Db, e: EventInput): Promise<{ ok: true; duplicate: boolean }> {
  const units = Math.min(MAX_UNITS, Math.max(1, Math.floor(e.units ?? 1)));
  if (e.type === 'search_click') {
    if (!e.submitKey || !e.articleId) return { ok: true, duplicate: true };
    const q = await db.query<{ id: number }>('UPDATE query_log SET clicked = true WHERE idem_key = $1 RETURNING id', [hashKey(['search', e.submitKey])]);
    const idem = hashKey(['click', e.submitKey, e.articleId]);
    const r = await db.query(
      `INSERT INTO events (type, idem_key, article_id, query_id, session_hash) VALUES ('search_click', $1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [idem, e.articleId, q[0]?.id ?? null, e.sessionHash],
    );
    return { ok: true, duplicate: r.length === 0 };
  }
  if (e.type === 'report_resolved' || e.type === 'report_unresolved') return recordOutcome(db, e.type, e.sessionHash, e.articleId ?? 0);
  if (e.type === 'report_encounter') {
    const idem = hashKey(['encounter', e.sessionHash, e.articleId ?? 0]);
    const r = await db.query<{ inserted: boolean }>(
      `INSERT INTO events (type, idem_key, article_id, session_hash, units) VALUES ('report_encounter', $1, $2, $3, $4)
       ON CONFLICT (idem_key) DO UPDATE SET units = EXCLUDED.units, updated_at = now(),
         changes = events.changes + CASE WHEN events.units <> EXCLUDED.units THEN 1 ELSE 0 END
       RETURNING (xmax = 0) AS inserted`,
      [idem, e.articleId ?? null, e.sessionHash, units],
    );
    return { ok: true, duplicate: !r[0]?.inserted };
  }
  // article_view / gallery_view / guide_answer：同一会话同一对象记一次
  const idem = hashKey([e.type, e.sessionHash, e.articleId ?? 0, e.nodeId ?? 0, e.optionId ?? 0]);
  const r = await db.query(
    `INSERT INTO events (type, idem_key, article_id, node_id, session_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
    [e.type, idem, e.articleId ?? null, e.nodeId ?? null, e.sessionHash],
  );
  return { ok: true, duplicate: r.length === 0 };
}

async function recordOutcome(db: Db, type: 'report_resolved' | 'report_unresolved', sessionHash: string, articleId: number) {
  const idem = hashKey(['outcome', sessionHash, articleId]);
  const r = await db.query<{ id: number; inserted: boolean }>(
    `INSERT INTO events (type, idem_key, article_id, session_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (idem_key) DO UPDATE SET type = EXCLUDED.type, updated_at = now(),
       changes = events.changes + CASE WHEN events.type <> EXCLUDED.type THEN 1 ELSE 0 END
     RETURNING id, (xmax = 0) AS inserted`,
    [type, idem, articleId, sessionHash],
  );
  const id = r[0].id;
  if (type === 'report_unresolved') {
    const t = await db.query<{ title: string }>(`SELECT published->>'title' AS title FROM articles WHERE id = $1`, [articleId]);
    await db.query(
      `INSERT INTO candidates (source, ref_id, text, article_id) VALUES ('unresolved', $1, $2, $3)
       ON CONFLICT (source, ref_id) DO UPDATE SET status = CASE WHEN candidates.status = 'ignored' THEN 'ignored' ELSE 'open' END`,
      [id, `没解决：${t[0]?.title ?? '#' + articleId}`, articleId],
    );
  } else {
    await db.query(
      `UPDATE candidates SET status = 'mapped', reason = '同一会话已改为已解决', handled_at = now()
        WHERE source = 'unresolved' AND ref_id = $1 AND status = 'open'`,
      [id],
    );
  }
  return { ok: true as const, duplicate: !r[0].inserted };
}

export async function recordFeedback(db: Db, p: { key: string; sessionHash: string | null; text: string; stage: string; extra: string; context: string }) {
  const text = redact(clip(p.text, 300)).text;
  const extra = redact(clip(p.extra, 500)).text;
  const context = redact(clip(p.context, 300)).text;
  const rows = await db.query<{ id: number }>(
    `INSERT INTO feedback (idem_key, text, stage, extra, context, session_hash) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idem_key) DO NOTHING RETURNING id`,
    [hashKey(['feedback', p.key]), text, clip(p.stage, 60) || null, extra, context, p.sessionHash],
  );
  if (rows[0]) {
    await db.query(`INSERT INTO candidates (source, ref_id, text) VALUES ('feedback', $1, $2) ON CONFLICT DO NOTHING`, [rows[0].id, text]);
  }
  return { duplicate: rows.length === 0 };
}

/** 有结果但无点击：提交 30 分钟后仍无点击的查询转为线索。 */
export async function collectNoClickCandidates(db: Db) {
  await db.query(
    `INSERT INTO candidates (source, ref_id, text)
     SELECT 'no_click', id, raw_redacted FROM query_log
      WHERE result_count > 0 AND NOT clicked AND created_at < now() - interval '30 minutes'
     ON CONFLICT DO NOTHING`,
  );
}
