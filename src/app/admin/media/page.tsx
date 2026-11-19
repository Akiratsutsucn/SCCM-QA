/** 图集与截图脱敏：上传（类型/大小校验、去 EXIF）、裁切打码、标签、关联文章、放入图集、确认脱敏。 */
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { RedactEditor } from '@/components/admin/RedactEditor';
import { getDb } from '@/lib/db';
import { stageLabels } from '@/lib/articles';
import { deleteMediaAction, editMediaAction, updateMediaAction, uploadMediaAction } from '../actions';

export const metadata: Metadata = { title: '图集' };

type Props = { searchParams: Promise<{ article?: string }> };

export default async function MediaPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const { article } = await searchParams;
  const filterId = Number(article) || null;
  const db = await getDb();
  const [articles, stages, items] = await Promise.all([
    db.query<{ id: number; title: string; status: string }>(`SELECT id, draft->>'title' AS title, status FROM articles WHERE status <> 'archived' ORDER BY updated_at DESC LIMIT 500`),
    stageLabels(db),
    db.query<{ id: string; caption: string; stage: string | null; tags: string[]; article_id: number | null; in_gallery: boolean; redaction_checked: boolean; is_public: boolean; broken: boolean; rev: number; width: number; height: number }>(
      `SELECT * FROM media ${filterId ? 'WHERE article_id = $1' : ''} ORDER BY created_at DESC LIMIT 200`, filterId ? [filterId] : [],
    ),
  ]);
  const articleSelect = (name: string, value: number | null) => (
    <select name={name} defaultValue={value ?? ''}>
      <option value="">不关联</option>
      {articles.map((a) => <option key={a.id} value={a.id}>{a.title || `#${a.id}`}{a.status === 'draft' ? '（草稿）' : ''}</option>)}
    </select>
  );

  return (
    <AdminShell current="/admin/media" user={user.username}>
      <h1 style={{ marginBottom: 6 }}>图集与截图</h1>
      <p className="muted" style={{ marginBottom: 16 }}>上传后系统会去除 EXIF/GPS 等元数据，但不会自动发现画面里的敏感信息。请裁掉计算机名、域名、资产号、账号、人脸、聊天窗口后再勾选「已检查脱敏」。只有已确认脱敏、并被已发布文章引用的图才会公开。</p>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>上传</h2>
        <ActionForm action={uploadMediaAction}>
          <div className="editor-grid">
            <div className="field full">
              <label htmlFor="files">图片（JPEG / PNG / WebP，单张 ≤ 5 MB，一次最多 10 张）</label>
              <input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp" required />
            </div>
            <div className="field"><label htmlFor="up-article">关联文章</label>{articleSelect('articleId', filterId)}</div>
            <div className="field"><label htmlFor="up-caption">说明（可选）</label><input id="up-caption" name="caption" type="text" maxLength={200} /></div>
          </div>
          <button className="btn btn-primary" type="submit">上传</button>
        </ActionForm>
      </div>

      {items.length === 0 ? (
        <div className="card empty"><p>还没有图片。</p></div>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="card" style={{ overflow: 'hidden' }}>
              <a href={`/media/${m.id}?v=full&r=${m.rev}`} target="_blank" rel="noreferrer" className="thumb-btn" style={{ display: 'block' }}>
                <img src={`/media/${m.id}?v=thumb&r=${m.rev}`} alt={m.caption || '截图'} loading="lazy" />
              </a>
              <div className="pad stack-sm">
                <div className="row">
                  <span className={`status ${m.is_public ? 'published' : 'draft'}`}>{m.is_public ? '已公开' : '未公开'}</span>
                  {m.broken && <span className="status archived">文件缺失</span>}
                  <span className="small muted">{m.width}×{m.height}</span>
                </div>
                <ActionForm action={updateMediaAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <div className="field"><label>说明</label><input name="caption" type="text" defaultValue={m.caption} maxLength={200} /></div>
                  <div className="field"><label>关联文章</label>{articleSelect('articleId', m.article_id)}</div>
                  <div className="field">
                    <label>阶段（图集过滤用，留空则用文章阶段）</label>
                    <select name="stage" defaultValue={m.stage ?? ''}><option value="">跟随文章</option>{stages.map((s) => <option key={s}>{s}</option>)}</select>
                  </div>
                  <div className="field"><label>症状标签（逗号分隔）</label><input name="tags" type="text" defaultValue={m.tags.join('，')} /></div>
                  <label className="check"><input type="checkbox" name="inGallery" defaultChecked={m.in_gallery} />放入「看图找问题」</label>
                  <label className="check"><input type="checkbox" name="redactionChecked" defaultChecked={m.redaction_checked} />已检查脱敏</label>
                  <button className="btn btn-sm btn-primary" type="submit">保存</button>
                </ActionForm>
                <RedactEditor id={m.id} rev={m.rev} action={editMediaAction} />
                <form action={deleteMediaAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="btn btn-sm btn-danger" type="submit">删除图片</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
