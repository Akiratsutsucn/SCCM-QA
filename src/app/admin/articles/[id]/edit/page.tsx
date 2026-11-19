/** 编辑文章：结构化字段、版本列表（恢复为草稿）、归档。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ArticleEditor } from '@/components/admin/ArticleEditor';
import { getDb } from '@/lib/db';
import { getArticle, listVersions, stageLabels } from '@/lib/articles';
import { ContentSchema, templateContent } from '@/lib/content';
import { archiveArticleAction, restoreVersionAction, saveArticleAction } from '../../../actions';
import { fmtDateTime } from '@/lib/time';

export const metadata: Metadata = { title: '编辑文章' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ restored?: string }> };

export default async function EditPage({ params, searchParams }: Props) {
  const user = await requireAdmin();
  const [{ id }, { restored }] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const a = await getArticle(db, Number(id));
  if (!a) notFound();
  const [stages, symptoms, versions, media] = await Promise.all([
    stageLabels(db),
    db.query<{ label: string }>(`SELECT label FROM vocabularies WHERE kind = 'symptom' AND active ORDER BY sort, id`),
    listVersions(db, a.id),
    db.query<{ id: string; caption: string; redaction_checked: boolean }>('SELECT id, caption, redaction_checked FROM media WHERE article_id = $1 ORDER BY created_at', [a.id]),
  ]);

  return (
    <AdminShell current="/admin/articles" user={user.username}>
      <div className="split" style={{ marginBottom: 12 }}>
        <div className="stack-sm">
          <Link href="/admin/articles" className="small">← 文章列表</Link>
          <h1>编辑文章 <span className={`status ${a.status}`}>{a.status === 'published' ? '已发布' : a.status === 'archived' ? '已下线' : '草稿'}</span></h1>
        </div>
        <div className="row">
          {a.status === 'published' && <Link className="btn" href={`/a/${a.slug}`} target="_blank">查看已发布版</Link>}
          <Link className="btn" href={`/admin/media?article=${a.id}`}>上传本文配图</Link>
        </div>
      </div>
      {restored && <p className="notice ok" style={{ marginBottom: 12 }}>已把第 {restored} 版恢复为当前草稿。发布后会成为新版本，历史保留。</p>}

      <ArticleEditor
        id={a.id}
        initial={ContentSchema.parse(a.draft)}
        stages={stages}
        symptomVocab={symptoms.map((s) => s.label)}
        media={media.map((m) => ({ id: m.id, caption: m.caption, checked: m.redaction_checked }))}
        action={saveArticleAction}
        template={templateContent()}
      />

      <details className="fold card pad" style={{ marginTop: 24 }}>
        <summary>更新日志与历史版本（{versions.length}）</summary>
        {versions.length === 0 ? <p className="muted">尚未发布过。</p> : (
          <ul className="list" style={{ marginTop: 10 }}>
            {versions.map((v) => (
              <li key={v.version_no} className="split">
                <span>第 {v.version_no} 版 · {fmtDateTime(v.created_at)} · {v.created_by}{v.note && ` · ${v.note}`}{a.published_version === v.version_no && '（当前已发布）'}</span>
                <form action={restoreVersionAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="version" value={v.version_no} />
                  <button className="btn btn-sm" type="submit">恢复为草稿</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </details>

      {a.status === 'published' && (
        <form action={archiveArticleAction} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={a.id} />
          <button className="btn btn-danger" type="submit">下线本文（操作端不再显示，历史保留）</button>
        </form>
      )}
    </AdminShell>
  );
}
