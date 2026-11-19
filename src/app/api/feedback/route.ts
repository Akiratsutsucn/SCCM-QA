/**
 * POST /api/feedback —— 未收录反馈（线索，不是工单）。
 * 防护：同源 Origin、按 IP 限流、长度限制、honeypot（website 字段）与最短填写耗时、幂等键。
 * 请求体：{ sessionId, key: uuid, text (1–300), stage?, extra? (≤500), context?, website?, elapsedMs? }
 */
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { recordFeedback } from '@/lib/events';
import { clientIp, hashSession, isSameOrigin, isValidSessionId, json } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { getSettings } from '@/lib/settings';

const Body = z.object({
  sessionId: z.string().optional(),
  key: z.string().refine(isValidSessionId),
  text: z.string().trim().min(1).max(300),
  stage: z.string().max(60).nullish(),
  extra: z.string().max(500).nullish(),
  context: z.string().max(300).nullish(),
  website: z.string().max(200).nullish(),
  elapsedMs: z.number().nonnegative().optional(),
});

const MIN_FILL_MS = 1500;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: 'origin' }, 403);
  const db = await getDb();
  const strict = (await getSettings(db)).strictRateLimit;
  if (!rateLimit(`fb:${clientIp(req)}`, strict ? 3 : 10, 10 * 60_000)) return json({ ok: false, error: 'rate' }, 429);
  const raw = await req.text();
  if (raw.length > 4096) return json({ ok: false, error: 'size' }, 413);
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(raw));
  } catch {
    return json({ ok: false, error: 'json' }, 400);
  }
  if (!parsed.success) return json({ ok: false, error: 'invalid' }, 400);
  const b = parsed.data;
  // bot：填了隐藏字段或提交过快 —— 假装成功，不入库
  if (b.website || (b.elapsedMs !== undefined && b.elapsedMs < MIN_FILL_MS)) return json({ ok: true, duplicate: false });
  const r = await recordFeedback(db, {
    key: b.key,
    sessionHash: isValidSessionId(b.sessionId) ? hashSession(b.sessionId) : null,
    text: b.text, stage: b.stage ?? '', extra: b.extra ?? '', context: b.context ?? '',
  });
  return json({ ok: true, ...r });
}
