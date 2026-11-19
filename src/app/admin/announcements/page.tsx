/** 首页公告栏管理（手册下载地址等）。首页最多显示 3 条：置顶优先，再按更新时间。 */
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { getDb } from '@/lib/db';
import { listAnnouncements, MAX_HOME_ANNOUNCEMENTS, type Announcement } from '@/lib/announcements';
import { deleteAnnouncementAction, saveAnnouncementAction, unpublishAnnouncementAction } from '../actions';
import { fmtDateTime } from '@/lib/time';

export const metadata: Metadata = { title: '公告' };

const local = (iso: string | null) => (iso ? fmtDateTime(iso).replace(' ', 'T') : '');

function AnnouncementForm({ a }: { a?: Announcement }) {
  const id = a?.id ?? 'new';
  return (
    <ActionForm action={saveAnnouncementAction}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="editor-grid">
        <div className="field full"><label htmlFor={`t-${id}`}>标题</label><input id={`t-${id}`} name="title" type="text" maxLength={80} defaultValue={a?.title} required placeholder="例如：Windows 11 升级操作手册 v2 已更新" /></div>
        <div className="field full"><label htmlFor={`b-${id}`}>说明（可选）</label><textarea id={`b-${id}`} name="body" maxLength={500} rows={2} defaultValue={a?.body} /></div>
        <div className="field"><label htmlFor={`u-${id}`}>链接（可选，http/https）</label><input id={`u-${id}`} name="linkUrl" type="url" maxLength={1000} defaultValue={a?.link_url ?? ''} placeholder="https://…/manual.pdf" /></div>
        <div className="field"><label htmlFor={`l-${id}`}>按钮文字</label><input id={`l-${id}`} name="linkLabel" type="text" maxLength={40} defaultValue={a?.link_label ?? ''} placeholder="下载手册" /></div>
        <div className="field"><label htmlFor={`s-${id}`}>开始显示（可选）</label><input id={`s-${id}`} name="startsAt" type="datetime-local" defaultValue={local(a?.starts_at ?? null)} /></div>
        <div className="field"><label htmlFor={`e-${id}`}>结束显示（可选）</label><input id={`e-${id}`} name="endsAt" type="datetime-local" defaultValue={local(a?.ends_at ?? null)} /></div>
      </div>
      <label className="check"><input type="checkbox" name="pinned" defaultChecked={a?.pinned} />置顶</label>
      <label className="check"><input type="checkbox" name="confirmPublic" />已确认文字和链接可以公开（首页对公网可见，链接地址本身也会被看到）</label>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" type="submit" name="intent" value="publish">{a?.published ? '更新并保持发布' : '发布到首页'}</button>
        <button className="btn" type="submit" name="intent" value="draft">{a?.published ? '保存并撤下' : '保存为未发布'}</button>
      </div>
    </ActionForm>
  );
}

export default async function AnnouncementsPage() {
  const user = await requireAdmin();
  const list = await listAnnouncements(await getDb());
  return (
    <AdminShell current="/admin/announcements" user={user.username}>
      <h1 style={{ marginBottom: 6 }}>公告</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        公告显示在操作端首页两个入口下方，最多 {MAX_HOME_ANNOUNCEMENTS} 条（置顶优先）。适合发布操作手册下载地址、维护通知等。首页对公网可见：不要放内网地址、账号或客户名。
      </p>
      <section className="card pad" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>新公告</h2>
        <AnnouncementForm />
      </section>
      {list.length === 0 ? <div className="card empty"><p>还没有公告。首页在没有公告时不显示公告栏。</p></div> : (
        <div className="stack">
          {list.map((a) => (
            <details key={a.id} className="card pad fold">
              <summary>
                <span className="row" style={{ width: '100%' }}>
                  <span className={`status ${a.published ? 'published' : 'draft'}`}>{a.published ? '已发布' : '未发布'}</span>
                  {a.pinned && <span className="status">置顶</span>}
                  <span>{a.title}</span>
                  <span className="small muted">更新于 {fmtDateTime(a.updated_at)}</span>
                </span>
              </summary>
              <AnnouncementForm a={a} />
              <div className="row" style={{ marginTop: 10 }}>
                {a.published && <form action={unpublishAnnouncementAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-sm" type="submit">撤下</button></form>}
                <form action={deleteAnnouncementAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-sm btn-danger" type="submit">删除</button></form>
              </div>
            </details>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
