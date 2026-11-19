/**
 * POST /api/events —— 匿名事件（这台也遇到了、已解决/没解决、浏览、点选、搜索点击）。
 * 防护：同源 Origin 校验、按 IP 限流（只防刷，不合并身份）、请求体大小与字段校验、服务端幂等。
 * 请求体：{ sessionId: uuid, type, articleId?, nodeId?, optionId?, mediaId?, submitKey?, units? }
 * 返回：{ ok: true, duplicate } 或 { ok: false, error }。
 */
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { EVENT_TYPES, MAX_UNITS, recordEvent } from '@/lib/events';
import { clientIp, hashSession, isSameOrigin, isValidSessionId, json } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { getSettings } from '@/lib/settings';

const Body = z.object({
  sessionId: z.string().refine(isValidSessionId),
  type: z.enum(EVENT_TYPES),
  articleId: z.number().int().positive().nullish(),
  nodeId: z.number().int().positive().nullish(),
  optionId: z.number().int().positive().nullish(),
  mediaId: z.string().regex(/^[A-Za-z0-9_-]{16}$/).nullish(),
  submitKey: z.string().regex(/^[0-9a-f]{16}$/).nullish(),
  units: z.number().int().min(1).max(MAX_UNITS).optional(),
});

const MAX_BODY = 2048;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: 'origin' }, 403);
  const db = await getDb();
  const strict = (await getSettings(db)).strictRateLimit;
  if (!rateLimit(`ev:${clientIp(req)}`, strict ? 30 : 120, 60_000)) return json({ ok: false, error: 'rate' }, 429);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'size' }, 413);
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(raw));
  } catch {
    return json({ ok: false, error: 'json' }, 400);
  }
  if (!parsed.success) return json({ ok: false, error: 'invalid' }, 400);
  const b = parsed.data;

  let articleId = b.articleId ?? null;
  if (b.type === 'gallery_view') {
    if (!b.mediaId) return json({ ok: false, error: 'invalid' }, 400);
    articleId = (await db.query<{ article_id: number }>('SELECT article_id FROM media WHERE id = $1 AND is_public', [b.mediaId]))[0]?.article_id ?? null;
    if (!articleId) return json({ ok: false, error: 'invalid' }, 400);
  } else if (b.type !== 'guide_answer') {
    if (!articleId) return json({ ok: false, error: 'invalid' }, 400);
    const ok = await db.query(`SELECT 1 FROM articles WHERE id = $1 AND status = 'published'`, [articleId]);
    if (!ok.length) return json({ ok: false, error: 'invalid' }, 400);
  }
  const r = await recordEvent(db, {
    type: b.type, sessionHash: hashSession(b.sessionId), articleId, nodeId: b.nodeId, optionId: b.optionId,
    submitKey: b.submitKey, units: b.units,
  });
  return json(r);
}
