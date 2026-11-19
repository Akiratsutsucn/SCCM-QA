/**
 * GET /admin/stats/export?days=7|30 —— 统计 CSV（须登录）。表头带口径，不导出任何「故障率」列。
 */
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { ADMIN_COOKIE, userFromToken } from '@/lib/auth';
import { perArticle, reportStats, usageStats } from '@/lib/stats';

const cell = (v: unknown) => {
  const s = String(v ?? '');
  // 防 CSV 公式注入
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const db = await getDb();
  const user = await userFromToken(db, (await cookies()).get(ADMIN_COOKIE)?.value);
  if (!user || user.mustChange) return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
  const days = new URL(req.url).searchParams.get('days') === '30' ? 30 : 7;
  const [u, r, rows] = await Promise.all([usageStats(db, days), reportStats(db, days), perArticle(db, days)]);
  const lines = [
    [`口径说明：最近 ${days} 天，Asia/Shanghai。搜索量与浏览量不等于故障发生次数；「这台也遇到了」为匿名自报，会话不等于被升级的电脑，跨人重复无法排除；本表不提供全网故障率。`],
    [],
    ['分类', '指标', '数值'],
    ['使用情况（不等于发生次数）', '搜索提交', u.submits],
    ['使用情况（不等于发生次数）', '结果为0的搜索', u.zero],
    ['使用情况（不等于发生次数）', '有结果无点击', u.noclick],
    ['使用情况（不等于发生次数）', '办法页浏览', u.views],
    ['匿名自报发生量', '这台也遇到了_生效次数', r.encounter.n],
    ['匿名自报发生量', '去重会话数', r.encounter.sessions],
    ['匿名自报发生量', '自报台数合计', r.encounter.units],
    ['结果反馈', '已解决', r.resolved.n],
    ['结果反馈', '没解决', r.unresolved.n],
    ['结果反馈', '同一会话改口次数', r.changes],
    [],
    ['文章', '浏览', '这台也遇到了_匿名自报', '自报会话数', '自报台数', '已解决', '没解决'],
    ...rows.map((a) => [a.title, a.views, a.encounter, a.encounter_sessions, a.units, a.resolved, a.unresolved]),
  ];
  const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="w11-stats-${days}d.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
