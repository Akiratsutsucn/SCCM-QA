/** 匿名写接口的通用防护：同源校验、客户端 IP（仅限流用）、会话哈希。 */
import { createHmac } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 允许的 Origin：PUBLIC_ORIGIN（逗号分隔）或与 Host 同源。 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = (process.env.PUBLIC_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 客户端 IP：只信任反向代理写入的 X-Real-IP / X-Forwarded-For 第一个值。仅用于限流。 */
export function clientIp(req: Request): string {
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export function isValidSessionId(s: unknown): s is string {
  return typeof s === 'string' && UUID.test(s);
}

function secret(): string {
  const s = process.env.SESSION_HASH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_HASH_SECRET 未设置或少于 16 位');
  return 'dev-only-session-hash-secret';
}

/** 会话 ID 只存 HMAC，备份中不直接出现原值。 */
export function hashSession(sessionId: string): string {
  return createHmac('sha256', secret()).update(sessionId).digest('hex').slice(0, 32);
}

export function hashKey(parts: (string | number)[]): string {
  return createHmac('sha256', secret()).update(parts.join('|')).digest('hex').slice(0, 40);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
