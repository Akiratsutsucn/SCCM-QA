/** 线索工作台（不是工单）：映射到已有文章 / 收为同义词 / 忽略（须原因）/ 新建草稿。没有负责人、到期日。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { getDb } from '@/lib/db';
import { candidateAction } from '../actions';
import { fmtDateTime } from '@/lib/time';

export const metadata: Metadata = { title: '线索' };

const SOURCES: [string, string][] = [['', '全部来源'], ['feedback', '未收录反馈'], ['zero_result', '零结果搜索'], ['no_click', '有结果无点击'], ['unresolved', '持续没解决']];
const STATUS: Record<string, string> = { open: '未处理', mapped: '已映射', synonym: '已收为同义词', ignored: '已忽略', drafted: '已建草稿' };

type Props = { searchParams: Promise<{ source?: string; status?: string }> };

export default async function CandidatesPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const { source = '', status = 'open' } = await searchParams;
  const db = await getDb();
  const params: unknown[] = [];
  const where: string[] = [];
  if (SOURCES.some(([k]) => k === source) && source) { params.push(source); where.push(`c.source = $${params.length}`); }
  if (status !== 'all') { params.push(status in STATUS ? status : 'open'); where.push(`c.status = $${params.length}`); }
  const rows = await db.query<{ id: number; source: string; text: string; status: string; reason: string; created_at: string; article_title: string | null; extra: string | null; stage: string | null }>(
    `SELECT c.*, coalesce(a.published->>'title', a.draft->>'title') AS article_title,
            f.extra, f.stage
       FROM candidates c
       LEFT JOIN articles a ON a.id = c.article_id
       LEFT JOIN feedback f ON c.source = 'feedback' AND f.id = c.ref_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.created_at DESC LIMIT 300`,
    params,
  );
  const articles = await db.query<{ id: number; title: string }>(`SELECT id, published->>'title' AS title FROM articles WHERE status = 'published' ORDER BY published_at DESC`);
  const link = (s: string, st: string) => `/admin/candidates?${new URLSearchParams({ ...(s ? { source: s } : {}), status: st })}`;

  return (
    <AdminShell current="/admin/candidates" user={user.username}>
      <h1 style={{ marginBottom: 6 }}>线索</h1>
      <p className="muted" style={{ marginBottom: 14 }}>这些只是候选线索，不是已证实的新问题，也不是工单。处理结果不会通知操作员。原文已在入库前脱敏。</p>
      <div className="chips" style={{ marginBottom: 8 }}>
        {SOURCES.map(([k, l]) => <Link key={k} className="chip" aria-current={source === k} href={link(k, status)}>{l}</Link>)}
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {[['open', '未处理'], ['all', '全部状态']].map(([k, l]) => <Link key={k} className="chip" aria-current={status === k} href={link(source, k)}>{l}</Link>)}
      </div>
      {rows.length === 0 ? <div className="card empty"><p>暂无线索。</p></div> : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} id={`c${r.id}`} className="stack-sm">
              <div className="split">
                <span className="small muted">{SOURCES.find(([k]) => k === r.source)?.[1]} · {fmtDateTime(r.created_at)}</span>
                <span className={`status ${r.status === 'open' ? 'draft' : 'published'}`}>{STATUS[r.status]}{r.reason && `：${r.reason}`}</span>
              </div>
              <p style={{ fontWeight: 600 }}>{r.text}</p>
              {(r.stage || r.extra) && <p className="small muted">{r.stage && `卡在：${r.stage}　`}{r.extra}</p>}
              {r.article_title && <p className="small">关联文章：{r.article_title}</p>}
              {r.status === 'open' && (
                <details className="fold">
                  <summary>处理</summary>
                  <div className="stack-sm">
                    <ActionForm action={candidateAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <div className="row">
                        <select name="articleId" defaultValue="" style={{ flex: '1 1 240px' }} aria-label="选择文章">
                          <option value="">选择已有文章</option>
                          {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                        </select>
                        <input name="phrase" type="text" defaultValue={r.text.slice(0, 100)} aria-label="同义词短语" style={{ flex: '1 1 200px' }} />
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn btn-sm" type="submit" name="act" value="map">映射到已有</button>
                        <button className="btn btn-sm" type="submit" name="act" value="synonym">收为同义词</button>
                        <button className="btn btn-sm btn-primary" type="submit" name="act" value="draft">新建文章草稿</button>
                      </div>
                    </ActionForm>
                    <ActionForm action={candidateAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="act" value="ignore" />
                      <div className="row">
                        <select name="reason" defaultValue="" required style={{ width: 'auto' }} aria-label="忽略原因">
                          <option value="">忽略原因</option>
                          {['重复', '乱码', '测试', '已覆盖', '无效'].map((x) => <option key={x}>{x}</option>)}
                        </select>
                        <button className="btn btn-sm" type="submit">忽略</button>
                      </div>
                    </ActionForm>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
