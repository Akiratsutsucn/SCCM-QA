/** GET /healthz —— 容器健康检查：数据库可查询即 200。不返回内部细节。 */
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    await (await getDb()).query('SELECT 1');
    return new Response('ok', { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('db unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
