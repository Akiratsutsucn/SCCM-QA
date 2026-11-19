/**
 * GET /media/:id?v=thumb|full —— 图片读取。
 * 公开：仅被已发布内容引用且已确认脱敏的图（is_public）；管理员登录后可读未发布图（no-store）。
 */
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { readMediaFile } from '@/lib/media';
import { ADMIN_COOKIE, userFromToken } from '@/lib/auth';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const kind = new URL(req.url).searchParams.get('v') === 'full' ? 'full' : 'thumb';
  const db = await getDb();
  const admin = await userFromToken(db, (await cookies()).get(ADMIN_COOKIE)?.value);
  let buf = await readMediaFile(db, id, kind, false);
  let isPublic = true;
  if (!buf && admin) {
    buf = await readMediaFile(db, id, kind, true);
    isPublic = false;
  }
  if (!buf) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': isPublic ? 'public, max-age=300' : 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
