/** 「今日」：每天打开后台先看这里。只是计数与线索，不是 BI，没有「故障率」。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { checkTree, mainTree } from '@/lib/guides';
import { collectNoClickCandidates } from '@/lib/events';
import { fmtDateTime } from '@/lib/time';
import { newArticleAction } from './actions';

export const metadata: Metadata = { title: '今日' };

const SOURCE_LABEL: Record<string, string> = { feedback: '未收录反馈', zero_result: '零结果搜索', no_click: '有结果无点击', unresolved: '持续没解决' };

export default async function TodayPage() {
  const user = await requireAdmin();
  const db = await getDb();
  await collectNoClickCandidates(db);
  const s = await getSettings(db);
  const counts = await db.query<{ source: string; n: number }>(`SELECT source, count(*)::int AS n FROM candidates WHERE status = 'open' GROUP BY source`);
  const c = (k: string) => counts.find((x) => x.source === k)?.n ?? 0;
  const [drafts] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM articles WHERE status = 'draft' OR (status = 'published' AND draft <> published)`);
  const [review] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM articles WHERE status = 'published' AND reviewed_at < (now() AT TIME ZONE 'Asia/Shanghai')::date - $1::int`, [s.reviewCycleDays]);
  const [broken] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM media WHERE broken`);
  const [unchecked] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM media WHERE NOT redaction_checked`);
  const tree = await mainTree(db);
  const guideIssues = (tree.root_node_id || tree.published_snapshot ? await checkTree(db, tree.id) : []).filter((i) => i.level === 'error');
  const latest = await db.query<{ id: number; source: string; text: string; created_at: string }>(
    `SELECT id, source, text, created_at FROM candidates WHERE status = 'open' ORDER BY created_at DESC LIMIT 8`,
  );

  const kpi = (href: string, label: string, n: number) => (
    <Link className="kpi" href={href}><span>{label}</span><b>{n}</b></Link>
  );

  return (
    <AdminShell current="/admin" user={user.username}>
      <div className="split" style={{ marginBottom: 16 }}>
        <h1>今日需要处理</h1>
        <div className="row">
          <form action={newArticleAction}><input type="hidden" name="template" value="1" /><button className="btn btn-primary" type="submit">按模板新建文章</button></form>
          <Link className="btn" href="/admin/announcements">发布公告</Link>
        </div>
      </div>
      <div className="kpis">
        {kpi('/admin/candidates?source=feedback', '未收录反馈', c('feedback'))}
        {kpi('/admin/candidates?source=zero_result', '零结果搜索', c('zero_result'))}
        {kpi('/admin/candidates?source=no_click', '有结果无点击', c('no_click'))}
        {kpi('/admin/candidates?source=unresolved', '持续没解决', c('unresolved'))}
        {kpi('/admin/articles?status=draft', '草稿 / 未发布修改', drafts.n)}
        {kpi('/admin/articles?status=review', `待复核（超过 ${s.reviewCycleDays} 天）`, review.n)}
        {kpi('/admin/guides', '引导校验错误', guideIssues.length)}
        {kpi('/admin/media', '未确认脱敏 / 失效图片', unchecked.n + broken.n)}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>以上都只是计数和线索，不等于故障发生次数。</p>

      <h2 style={{ margin: '28px 0 10px' }}>最新线索</h2>
      {latest.length === 0 ? (
        <div className="card empty"><p>暂无线索。</p></div>
      ) : (
        <ul className="list">
          {latest.map((l) => (
            <li key={l.id} className="split">
              <span className="stack-sm" style={{ minWidth: 0 }}>
                <span className="small muted">{SOURCE_LABEL[l.source]} · {fmtDateTime(l.created_at)}</span>
                <span style={{ display: 'block' }}>{l.text}</span>
              </span>
              <Link className="btn btn-sm" href={`/admin/candidates?focus=${l.id}#c${l.id}`}>处理</Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
