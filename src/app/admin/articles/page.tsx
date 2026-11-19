/** 文章列表：桌面为克制的表格，窄屏转卡片（.table.responsive）。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { newArticleAction } from '../actions';
import { fmtDate } from '@/lib/time';

export const metadata: Metadata = { title: '文章' };

const STATUS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已下线' };

type Props = { searchParams: Promise<{ status?: string; q?: string }> };

export default async function ArticlesPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const { status = '', q = '' } = await searchParams;
  const db = await getDb();
  const s = await getSettings(db);
  const where: string[] = [];
  const params: unknown[] = [];
  if (status === 'draft') where.push(`(status = 'draft' OR (status = 'published' AND draft <> published))`);
  else if (status === 'review') {
    params.push(s.reviewCycleDays);
    where.push(`status = 'published' AND reviewed_at < (now() AT TIME ZONE 'Asia/Shanghai')::date - $${params.length}::int`);
  } else if (['published', 'archived'].includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (q.trim()) {
    params.push(`%${q.trim().slice(0, 100)}%`);
    where.push(`(draft->>'title' ILIKE $${params.length} OR draft::text ILIKE $${params.length})`);
  }
  const rows = await db.query<{ id: number; slug: string; status: string; title: string; stage: string; codes: string; reviewed_at: string | null; updated_at: string; dirty: boolean }>(
    `SELECT id, slug, status, draft->>'title' AS title, draft->>'stage' AS stage,
            (SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(draft->'codes') x) AS codes,
            reviewed_at, updated_at, (status = 'published' AND draft <> published) AS dirty
       FROM articles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT 500`,
    params,
  );
  const tab = (v: string, label: string) => (
    <Link className="chip" aria-current={status === v} href={v ? `/admin/articles?status=${v}` : '/admin/articles'}>{label}</Link>
  );

  return (
    <AdminShell current="/admin/articles" user={user.username}>
      <div className="split" style={{ marginBottom: 14 }}>
        <h1>文章</h1>
        <div className="row">
          <form action={newArticleAction}><button className="btn btn-primary" type="submit">新建空白文章</button></form>
          <form action={newArticleAction}><input type="hidden" name="template" value="1" /><button className="btn" type="submit">按模板新建</button></form>
        </div>
      </div>
      <div className="split" style={{ marginBottom: 14 }}>
        <div className="chips">{tab('', '全部')}{tab('draft', '草稿/未发布修改')}{tab('published', '已发布')}{tab('review', '待复核')}{tab('archived', '已下线')}</div>
        <form className="row" action="/admin/articles" method="get" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          {status && <input type="hidden" name="status" value={status} />}
          <input type="search" name="q" defaultValue={q} placeholder="按标题或内容查找" style={{ flex: 1 }} />
          <button className="btn" type="submit">查找</button>
        </form>
      </div>
      {rows.length === 0 ? (
        <div className="card empty"><p>{q || status ? '没有符合条件的文章。' : '还没有文章。可以「按模板新建」开始写第一篇。'}</p></div>
      ) : (
        <table className="table responsive">
          <thead><tr><th>标题</th><th>阶段</th><th>错误码</th><th>状态</th><th>最近复核</th><th>更新</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="标题"><Link href={`/admin/articles/${r.id}/edit`}>{r.title || '（未填写标题）'}</Link></td>
                <td data-label="阶段" className="num">{r.stage || '—'}</td>
                <td data-label="错误码" className="num">{r.codes || '—'}</td>
                <td data-label="状态" className="num">
                  <span className={`status ${r.status}`}>{STATUS[r.status]}</span>
                  {r.dirty && <span className="status draft" style={{ marginLeft: 4 }}>有未发布修改</span>}
                </td>
                <td data-label="最近复核" className="num">{r.reviewed_at ? fmtDate(r.reviewed_at) : '—'}</td>
                <td data-label="更新" className="num">{fmtDate(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
