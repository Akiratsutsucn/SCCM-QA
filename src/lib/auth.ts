/**
 * 管理端会话。cookie 只存随机令牌；数据库存其 SHA-256。
 * HttpOnly + SameSite=Strict + Secure（生产）。每个管理页面与 Server Action 都调用 requireAdmin()。
 */
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, type Db } from './db';
import { verifyPassword } from './password';

export const ADMIN_COOKIE = 'w11_admin';
const SESSION_HOURS = 12;
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86);

export interface AdminUser {
  id: number;
  username: string;
  mustChange: boolean;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function secureCookies(): boolean {
  return process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
}

export async function login(db: Db, username: string, password: string): Promise<string | null> {
  const rows = await db.query<{ id: number; password_hash: string }>('SELECT id, password_hash FROM admin_users WHERE username = $1', [username]);
  // 账号不存在时也做一次校验，避免时序差暴露账号是否存在
  const ok = await verifyPassword(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) return null;
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [sha(token), rows[0].id, SESSION_HOURS],
  );
  await db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [rows[0].id]);
  await db.query('DELETE FROM admin_sessions WHERE expires_at < now()');
  return token;
}

export async function userFromToken(db: Db, token: string | undefined): Promise<AdminUser | null> {
  if (!token) return null;
  const rows = await db.query<{ id: number; username: string; must_change: boolean }>(
    `SELECT u.id, u.username, u.must_change FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sha(token)],
  );
  return rows[0] ? { id: rows[0].id, username: rows[0].username, mustChange: rows[0].must_change } : null;
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.query('DELETE FROM admin_sessions WHERE id = $1', [sha(token)]);
}

export async function currentAdmin(): Promise<AdminUser | null> {
  const jar = await cookies();
  return userFromToken(await getDb(), jar.get(ADMIN_COOKIE)?.value);
}

/** 页面与 Server Action 的鉴权入口。未登录跳转登录页；须改口令时只允许进入改口令页。 */
export async function requireAdmin(opts: { allowMustChange?: boolean } = {}): Promise<AdminUser> {
  const user = await currentAdmin();
  if (!user) redirect('/admin/login');
  if (user.mustChange && !opts.allowMustChange) redirect('/admin/password');
  return user;
}

export async function audit(db: Db, actor: string, action: string, detail: Record<string, unknown> = {}) {
  await db.query('INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3::jsonb)', [actor, action, JSON.stringify(detail)]);
}
